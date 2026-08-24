import type { ModelRuntime } from "@earendil-works/pi-coding-agent";
import { describe, expect, it, type Mock, vi } from "vitest";

import type {
  ProviderAuthFlowSnapshot,
  ProviderAuthType,
} from "@uix/api/agent-channels";

import {
  createProviderAuthFlowCoordinator,
  type ProviderAuthFlowCoordinator,
} from "./provider-auth-flow";

type AuthInteraction = Parameters<ModelRuntime["login"]>[2];

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((next) => {
    resolve = next;
  });
  return { promise, resolve };
}

function createHarness(options: {
  login: (
    authType: ProviderAuthType,
    interaction: AuthInteraction,
  ) => Promise<void>;
  getModelRuntime?: () => Promise<ReturnType<typeof createRuntime>>;
}): {
  coordinator: ProviderAuthFlowCoordinator;
  runtime: ReturnType<typeof createRuntime>;
  snapshots: ProviderAuthFlowSnapshot[];
  opened: string[];
  availabilityChanged: Mock;
} {
  const snapshots: ProviderAuthFlowSnapshot[] = [];
  const opened: string[] = [];
  const availabilityChanged = vi.fn();
  const runtime = createRuntime(options.login);
  const coordinator = createProviderAuthFlowCoordinator({
    getModelRuntime:
      options.getModelRuntime ?? (() => Promise.resolve(runtime)),
    openExternal: (url) => {
      opened.push(url);
      return Promise.resolve();
    },
    onSnapshot: (snapshot) => snapshots.push(snapshot),
    onAvailabilityChange: availabilityChanged,
  });
  return { coordinator, runtime, snapshots, opened, availabilityChanged };
}

function createRuntime(
  login: (
    authType: ProviderAuthType,
    interaction: AuthInteraction,
  ) => Promise<void>,
): {
  getProvider: (providerId: string) =>
    | {
        auth: {
          apiKey: { login: () => void };
          oauth: { login: () => void };
        };
      }
    | undefined;
  login: (
    providerId: string,
    authType: ProviderAuthType,
    interaction: AuthInteraction,
  ) => Promise<void>;
} {
  return {
    getProvider: (providerId: string) =>
      providerId === "fake"
        ? {
            auth: {
              apiKey: { login: () => {} },
              oauth: { login: () => {} },
            },
          }
        : undefined,
    login: (
      _providerId: string,
      authType: ProviderAuthType,
      interaction: AuthInteraction,
    ) => login(authType, interaction),
  };
}

async function settle(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

describe("provider auth flow coordinator", () => {
  it("retains provider notices while requesting sequential answers", async () => {
    const answers: string[] = [];
    const harness = createHarness({
      login: async (authType, interaction) => {
        expect(authType).toBe("oauth");
        interaction.notify({
          type: "info",
          message: "Choose the account you want to use",
          links: [
            { label: "Account help", url: "https://provider.example/help" },
          ],
        });
        interaction.notify({
          type: "auth_url",
          url: "https://provider.example/authorize",
          instructions: "Authorize in your browser",
        });
        answers.push(
          await interaction.prompt({
            type: "manual_code",
            message: "Paste the redirect URL or authorization code",
          }),
        );
        answers.push(
          await interaction.prompt({
            type: "select",
            message: "Choose account",
            options: [
              { id: "work", label: "Work", description: "Company account" },
            ],
          }),
        );
      },
    });

    const started = harness.coordinator.begin("fake", "oauth");
    expect(started.phase).toEqual({ type: "starting" });
    await settle();

    const manualCode = harness.coordinator.getCurrentSnapshot();
    expect(manualCode).toMatchObject({
      flowId: started.flowId,
      phase: { type: "active" },
      prompt: { type: "input", secret: false },
      notices: [
        { type: "info", message: "Choose the account you want to use" },
        { type: "authorization", instructions: "Authorize in your browser" },
      ],
    });
    const helpLink = manualCode?.notices[0];
    if (helpLink?.type !== "info") throw new Error("Expected info notice");
    const firstLink = helpLink.links[0];
    if (!manualCode?.prompt) {
      throw new Error("Expected retained link and prompt");
    }
    await harness.coordinator.openLink(started.flowId, firstLink.linkId);

    harness.coordinator.answer(
      started.flowId,
      manualCode.prompt.promptId,
      "callback-code",
    );
    await settle();

    const select = harness.coordinator.getCurrentSnapshot();
    expect(select?.prompt).toEqual({
      type: "select",
      promptId: "prompt-2",
      message: "Choose account",
      options: [{ id: "work", label: "Work", description: "Company account" }],
    });
    if (!select?.prompt) throw new Error("Expected selection prompt");
    harness.coordinator.answer(started.flowId, select.prompt.promptId, "work");
    await settle();

    expect(answers).toEqual(["callback-code", "work"]);
    expect(harness.snapshots.at(-1)?.phase).toEqual({ type: "success" });
    expect(harness.opened).toEqual([
      "https://provider.example/authorize",
      "https://provider.example/help",
    ]);
    expect(harness.availabilityChanged).toHaveBeenCalledOnce();
  });

  it("passes empty answers through when Pi does not require a value", async () => {
    const answers: string[] = [];
    const harness = createHarness({
      login: async (_authType, interaction) => {
        answers.push(
          await interaction.prompt({
            type: "text",
            message: "Configure credentials, then press Enter",
          }),
        );
      },
    });

    const flow = harness.coordinator.begin("fake", "api_key");
    await settle();
    const prompt = harness.coordinator.getCurrentSnapshot()?.prompt;
    if (!prompt) throw new Error("Expected input prompt");
    harness.coordinator.answer(flow.flowId, prompt.promptId, "");
    await settle();

    expect(answers).toEqual([""]);
    expect(harness.snapshots.at(-1)?.phase.type).toBe("success");
  });

  it("claims the flow before loading the runtime", async () => {
    const runtimeLoad = deferred<ReturnType<typeof createRuntime>>();
    const harness = createHarness({
      login: async () => {},
      getModelRuntime: () => runtimeLoad.promise,
    });

    const flow = harness.coordinator.begin("fake", "oauth");
    expect(harness.coordinator.getCurrentSnapshot()).toEqual(flow);
    expect(() => harness.coordinator.begin("fake", "api_key")).toThrow(
      "already active",
    );

    harness.coordinator.cancel(flow.flowId);
    runtimeLoad.resolve(harness.runtime);
    await settle();
    expect(harness.snapshots.at(-1)?.phase.type).toBe("cancelled");
    expect(harness.availabilityChanged).not.toHaveBeenCalled();
  });

  it("ignores late provider callbacks after cancellation", async () => {
    let interaction: AuthInteraction | undefined;
    const harness = createHarness({
      login: async (_authType, value) => {
        interaction = value;
        await new Promise<void>((resolve) =>
          value.signal?.addEventListener("abort", () => {
            resolve();
          }),
        );
      },
    });

    const flow = harness.coordinator.begin("fake", "oauth");
    await settle();
    harness.coordinator.cancel(flow.flowId);
    if (!interaction) throw new Error("Expected provider interaction");
    interaction.notify({
      type: "auth_url",
      url: "https://provider.example/late",
    });
    await settle();

    expect(harness.opened).toEqual([]);
    expect(harness.snapshots.at(-1)?.phase.type).toBe("cancelled");
  });

  it("rejects stale answers and prompt-level cancellation", async () => {
    const promptAbort = new AbortController();
    let promptRejected = false;
    const harness = createHarness({
      login: async (_authType, interaction) => {
        try {
          await interaction.prompt({
            type: "text",
            message: "Code",
            signal: promptAbort.signal,
          });
        } catch {
          promptRejected = true;
        }
      },
    });

    const flow = harness.coordinator.begin("fake", "oauth");
    await settle();
    expect(() => {
      harness.coordinator.answer(flow.flowId, "stale-prompt", "value");
    }).toThrow("not pending");

    promptAbort.abort();
    await settle();
    expect(promptRejected).toBe(true);
  });

  it("publishes unsupported methods and provider failures as flow failures", async () => {
    const missing = createHarness({ login: async () => {} });
    const missingFlow = missing.coordinator.begin("missing", "oauth");
    await settle();
    const missingSnapshot = missing.snapshots.at(-1);
    expect(missingSnapshot?.flowId).toBe(missingFlow.flowId);
    expect(missingSnapshot?.phase.type).toBe("failure");
    if (missingSnapshot?.phase.type !== "failure") {
      throw new Error("Expected failed flow");
    }
    expect(missingSnapshot.phase.message).toContain("not offered");

    const failed = createHarness({
      login: () => Promise.reject(new Error("provider unavailable")),
    });
    const failedFlow = failed.coordinator.begin("fake", "oauth");
    await settle();
    expect(failed.snapshots.at(-1)).toMatchObject({
      flowId: failedFlow.flowId,
      phase: { type: "failure", message: "provider unavailable" },
    });
    expect(failed.availabilityChanged).not.toHaveBeenCalled();
  });

  it("aborts active work on disposal without publishing cancellation", async () => {
    let signal: AbortSignal | undefined;
    const harness = createHarness({
      login: async (_authType, interaction) => {
        signal = interaction.signal;
        await interaction.prompt({ type: "text", message: "Code" });
      },
    });
    harness.coordinator.begin("fake", "oauth");
    await settle();

    harness.coordinator[Symbol.dispose]();
    await settle();

    expect(signal?.aborted).toBe(true);
    expect(
      harness.snapshots.some((snapshot) => snapshot.phase.type === "cancelled"),
    ).toBe(false);
    expect(() => harness.coordinator.begin("fake", "oauth")).toThrow(
      "disposed",
    );
  });
});
