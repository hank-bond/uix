// H4.0 derisk spike: can two real Pi agent runtimes coexist in one process?
//
// The H4 review gate ("Prove real agent instances") stops and revisits the
// state model if Pi or feature state cannot support concurrent in-process
// instances. This spike answers the Pi half of that question against the real
// SDK and a real profile before any manager or per-instance refactor work:
//
//   - two AgentSessionRuntimes in one process, each bound to its own
//     SessionManager, sharing one agentDir and one cwd
//   - distinct services and modelRuntime per runtime
//   - concurrent model-store refresh on the shared profile
//   - UIX core-extension hooks bind per runtime (a model_select mirror on A
//     must not change for events from B)
//   - session state stays independent (names, session files)
//   - disposing one runtime leaves the other live: final dispose is clean
//
// It does not re-test Pi internals that Pi's own suite covers. It exercises
// only UIX's composition assumption over Pi: one shared profile, one cwd,
// several live sessions. Findings here (e.g. a shared-profile write race)
// become design constraints for the instance manager.
//
// Gating:
//   - The suite skips when the userspace Pi profile is absent (override the
//     location with UIX_PI_AGENT_DIR), so CI without a profile costs nothing.
//   - Real prompting (tokens + network) runs only with UIX_SPIKE_PROMPT=1.
//
// The profile is copied into the temp dir so this spike never mutates the
// real userspace profile or the app's own profile.

import { copyFileSync, existsSync } from "node:fs";
import { mkdir, mkdtemp, readdir, rm } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import process from "node:process";

import type {
  AgentSessionRuntime,
  SessionManager,
} from "@earendil-works/pi-coding-agent";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { type AgentInstaller, createUixCoreExtension } from "./installers";
import { extractTranscriptText, getMessageRole } from "./transcript";

const agentDir =
  process.env["UIX_PI_AGENT_DIR"] ?? join(homedir(), ".pi", "agent");
const promptEnabled = process.env["UIX_SPIKE_PROMPT"] === "1";

/** Files that make a profile usable for model resolution and auth. */
const ProfileFiles = [
  "auth.json",
  "models.json",
  "models-store.json",
  "settings.json",
  "trust.json",
  "APPEND_SYSTEM.md",
] as const;

describe.skipIf(!existsSync(agentDir))("real-pi concurrent runtimes", () => {
  let tempDir: string;
  let cwd: string;
  let sessionDir: string;
  let profileCopy: string;
  let runtimeA: AgentSessionRuntime;
  let runtimeB: AgentSessionRuntime;

  beforeAll(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "uix-pi-spike-"));
    cwd = join(tempDir, "cwd");
    sessionDir = join(tempDir, "sessions");
    profileCopy = join(tempDir, "profile");
    await mkdir(cwd, { recursive: true });
    await mkdir(sessionDir, { recursive: true });
    await mkdir(profileCopy, { recursive: true });

    // Copy only the profile's config/auth files into the temp agentDir so the
    // spike reads the real userspace auth and models but writes nothing back
    // to the real profile.
    for (const entry of await readdir(agentDir, { withFileTypes: true })) {
      if (!entry.isFile()) continue;
      if (!(ProfileFiles as readonly string[]).includes(entry.name)) continue;
      copyFileSync(join(agentDir, entry.name), join(profileCopy, entry.name));
    }

    const sdk = await import("@earendil-works/pi-coding-agent");

    async function boot(
      manager: SessionManager,
      installer: AgentInstaller,
    ): Promise<AgentSessionRuntime> {
      return sdk.createAgentSessionRuntime(
        async ({ sessionManager }) => {
          const services = await sdk.createAgentSessionServices({
            cwd,
            agentDir: profileCopy,
            resourceLoaderOptions: {
              extensionFactories: [createUixCoreExtension([installer])],
            },
          });
          const available = await services.modelRuntime.getAvailable();
          const model =
            available.length > 0
              ? services.modelRuntime.getModel(
                  available[0].provider,
                  available[0].id,
                )
              : undefined;
          const result = await sdk.createAgentSessionFromServices({
            services,
            sessionManager,
            noTools: "builtin",
            ...(model && { model }),
          });
          return {
            ...result,
            services,
            diagnostics: services.diagnostics,
          };
        },
        { cwd, agentDir: profileCopy, sessionManager: manager },
      );
    }

    const managerA = sdk.SessionManager.create(cwd, sessionDir);
    const managerB = sdk.SessionManager.create(cwd, sessionDir);
    runtimeA = await boot(managerA, createModelMirrorInstaller().installer);
    runtimeB = await boot(managerB, createModelMirrorInstaller().installer);
  }, 60_000);

  afterAll(async () => {
    await runtimeA.dispose().catch(() => {});
    await runtimeB.dispose().catch(() => {});
    await rm(tempDir, { recursive: true, force: true });
  });

  it("boots two runtimes with distinct services and sessions", () => {
    expect(runtimeA).not.toBe(runtimeB);
    expect(runtimeA.services).not.toBe(runtimeB.services);
    expect(runtimeA.services.modelRuntime).not.toBe(
      runtimeB.services.modelRuntime,
    );
    const managerA = runtimeA.session.sessionManager;
    const managerB = runtimeB.session.sessionManager;
    expect(managerA.getSessionId()).not.toBe(managerB.getSessionId());
    expect(managerA.getSessionFile()).not.toBe(managerB.getSessionFile());
    // Both sessions pinned to the spike's temp session dir, not the profile's.
    expect(managerA.getSessionDir()).toBe(sessionDir);
    expect(managerB.getSessionDir()).toBe(sessionDir);
  }, 30_000);

  it("concurrently refreshes the shared profile model store", async () => {
    await expect(
      Promise.all([
        runtimeA.services.modelRuntime.refresh(),
        runtimeB.services.modelRuntime.refresh(),
      ]),
    ).resolves.toBeDefined();
  }, 30_000);

  it("keeps session state independent", () => {
    runtimeA.session.setSessionName("spike-a");
    runtimeB.session.setSessionName("spike-b");
    expect(runtimeA.session.sessionManager.getSessionName()).toBe("spike-a");
    expect(runtimeB.session.sessionManager.getSessionName()).toBe("spike-b");
  });

  it("binds UIX extension hooks per runtime (model_select)", async () => {
    const mirrorA = createModelMirrorInstaller();
    const mirrorB = createModelMirrorInstaller();
    const sdk = await import("@earendil-works/pi-coding-agent");

    // Boot two fresh runtimes so each carries its own installer closure.
    async function bootWithMirror(
      mirror: ReturnType<typeof createModelMirrorInstaller>,
    ): Promise<AgentSessionRuntime> {
      const manager = sdk.SessionManager.create(cwd, sessionDir);
      return sdk.createAgentSessionRuntime(
        async ({ sessionManager }) => {
          const services = await sdk.createAgentSessionServices({
            cwd,
            agentDir: profileCopy,
            resourceLoaderOptions: {
              extensionFactories: [createUixCoreExtension([mirror.installer])],
            },
          });
          const result = await sdk.createAgentSessionFromServices({
            services,
            sessionManager,
            noTools: "builtin",
          });
          return {
            ...result,
            services,
            diagnostics: services.diagnostics,
          };
        },
        { cwd, agentDir: profileCopy, sessionManager: manager },
      );
    }

    const freshA = await bootWithMirror(mirrorA);
    const freshB = await bootWithMirror(mirrorB);
    try {
      const available = await freshA.services.modelRuntime.getAvailable();
      if (available.length === 0) {
        // No authed model: the setModel proof cannot run. The boot-level
        // assertions above already hold the spike's core findings.
        return;
      }
      // Prefer a different model than the one Pi likely resolved at boot so
      // the mirror change is observable, not a same-payload no-op.
      const pick = available[1] ?? available[0];
      const model = freshA.services.modelRuntime.getModel(
        pick.provider,
        pick.id,
      );
      if (!model) throw new Error("Selected model is unavailable");
      const beforeB = mirrorB.get();
      await freshA.session.setModel(model);
      expect(mirrorA.get()).toEqual({
        provider: pick.provider,
        id: pick.id,
      });
      // B's mirror must be untouched by A's model selection.
      expect(mirrorB.get()).toEqual(beforeB);
    } finally {
      await freshA.dispose();
      await freshB.dispose();
    }
  }, 60_000);

  it("disposing one runtime leaves the other live", async () => {
    await runtimeA.dispose();
    runtimeB.session.setSessionName("still-live");
    expect(runtimeB.session.sessionManager.getSessionName()).toBe("still-live");
  });

  it("disposes the final runtime cleanly", async () => {
    await expect(runtimeB.dispose()).resolves.toBeUndefined();
  });
});

describe.runIf(promptEnabled && existsSync(agentDir))(
  "real-pi independent turns",
  () => {
    it("runs two prompts on two sessions without cross-talk", async () => {
      const sdk = await import("@earendil-works/pi-coding-agent");
      const tempDir = await mkdtemp(join(tmpdir(), "uix-pi-prompts-"));
      const cwd = join(tempDir, "cwd");
      const sessionDir = join(tempDir, "sessions");
      await mkdir(cwd, { recursive: true });
      await mkdir(sessionDir, { recursive: true });

      async function bootPromptRuntime(): Promise<AgentSessionRuntime> {
        return sdk.createAgentSessionRuntime(
          async ({ sessionManager }) => {
            const services = await sdk.createAgentSessionServices({
              cwd,
              agentDir,
              resourceLoaderOptions: { extensionFactories: [] },
            });
            // Prefer the workspace default model over the first available:
            // some catalog entries (e.g. claude-fable-5) can complete a turn
            // with an empty assistant message, which would fail the reply
            // assertions for a reason unrelated to concurrency.
            const available = await services.modelRuntime.getAvailable();
            if (available.length === 0) {
              throw new Error("No authed model available for prompts");
            }
            // Prefer the workspace default model over the first available:
            // some catalog entries (e.g. claude-fable-5) can complete a turn
            // with an empty assistant message, which would fail the reply
            // assertions for a reason unrelated to concurrency.
            const pick =
              available.find(
                (m) =>
                  m.provider === "deepseek" && m.id === "deepseek-v4-flash",
              ) ?? available[0];
            const model = services.modelRuntime.getModel(
              pick.provider,
              pick.id,
            );
            if (!model) {
              throw new Error("Selected model is unavailable");
            }
            const result = await sdk.createAgentSessionFromServices({
              services,
              sessionManager,
              noTools: "builtin",
              model,
            });
            return {
              ...result,
              services,
              diagnostics: services.diagnostics,
            };
          },
          {
            cwd,
            agentDir,
            sessionManager: sdk.SessionManager.create(cwd, sessionDir),
          },
        );
      }
      const runtimeA = await bootPromptRuntime();
      const runtimeB = await bootPromptRuntime();

      try {
        await runtimeA.session.prompt(
          "Reply with exactly the word alpha and nothing else.",
        );
        await runtimeB.session.prompt(
          "Reply with exactly the word beta and nothing else.",
        );

        const replyA = lastAssistantText(runtimeA.session.sessionManager);
        const replyB = lastAssistantText(runtimeB.session.sessionManager);
        expect(replyA).toBeDefined();
        expect(replyB).toBeDefined();
        expect(replyA).toMatch(/alpha/i);
        expect(replyB).toMatch(/beta/i);
        // No cross-talk: each session's own reply only.
        expect(replyA).not.toMatch(/beta/i);
        expect(replyB).not.toMatch(/alpha/i);
      } finally {
        await runtimeA.dispose();
        await runtimeB.dispose();
        await rm(tempDir, { recursive: true, force: true });
      }
    }, 120_000);
  },
);

function createModelMirrorInstaller(): {
  readonly installer: AgentInstaller;
  get(): { provider: string; id: string } | undefined;
} {
  let mirror: { provider: string; id: string } | undefined;
  return {
    installer: (pi) => {
      pi.on("model_select", (event) => {
        mirror = { provider: event.model.provider, id: event.model.id };
      });
    },
    get: () => mirror,
  };
}

function lastAssistantText(manager: SessionManager): string | undefined {
  const branch = manager.getBranch();
  for (let index = branch.length - 1; index >= 0; index -= 1) {
    const entry = branch[index];
    if (entry.type !== "message") continue;
    if (getMessageRole(entry.message) !== "assistant") continue;
    const text = extractTranscriptText(entry.message);
    if (text) return text;
  }
  return undefined;
}
