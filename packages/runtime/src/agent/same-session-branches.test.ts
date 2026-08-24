// Same-session branch writes: can two writers append rows to one session tree?
//
// Design question: UIX later wants "all sub-agents together in one session".
// A session is an append-only tree in one JSONL file. If each agent only owns
// a branch (a leaf position and the rows it appends below it), and row
// appends are serialized, then several live agents can share one durable
// session without exclusive file ownership.
//
// Pi's SessionManager holds one leaf pointer and an in-memory index of the
// whole file. Two managers on the same file each have a stale index, so each
// agent's appends naturally fork at its own leaf. The file-level risks are:
//   - appends interleaving (line corruption): prevented by single-line
//     O_APPEND writes
//   - rewrites from a stale index dropping another writer's rows: only on
//     compaction / version migration / fresh-session first assistant flush,
//     not on plain appends after open()
//   - a joining manager landing its leaf on another live agent's branch
//     instead of a trunk point
//
// Level 1 (always runs, no profile, no tokens): raw append-level proof that
// two managers on one file write disjoint branches and the file stays a valid
// tree. Level 2 (UIX_SPIKE_PROMPT=1 + profile): two real live agents prompt
// concurrently on two branches of one session file.
//
// This is a spike probe for the H4 design, not a re-test of Pi internals.

import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import process from "node:process";

import type {
  AgentSessionRuntime,
  SessionEntry,
  SessionManager,
} from "@earendil-works/pi-coding-agent";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { extractTranscriptText } from "./transcript";

const agentDir =
  process.env["UIX_PI_AGENT_DIR"] ?? join(homedir(), ".pi", "agent");
const promptEnabled = process.env["UIX_SPIKE_PROMPT"] === "1";

/** The message shape SessionManager.appendMessage accepts, derived from its signature. */
type AppendableMessage = Parameters<SessionManager["appendMessage"]>[0];

function userMessage(text: string): AppendableMessage {
  return { role: "user", content: text } as unknown as AppendableMessage;
}

function assistantMessage(text: string): AppendableMessage {
  return {
    role: "assistant",
    content: text,
  } as unknown as AppendableMessage;
}

function messageTexts(entries: readonly SessionEntry[]): string[] {
  return entries
    .filter((entry) => entry.type === "message")
    .map((entry) => extractTranscriptText(entry.message));
}

describe("same-session branch appends", () => {
  let tempDir: string;
  let cwd: string;
  let sessionDir: string;

  beforeAll(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "uix-branch-"));
    cwd = join(tempDir, "cwd");
    sessionDir = join(tempDir, "sessions");
    await mkdir(cwd, { recursive: true });
    await mkdir(sessionDir, { recursive: true });
  });

  afterAll(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("two managers append disjoint branches to one session file without corruption", async () => {
    const sdk = await import("@earendil-works/pi-coding-agent");

    // Seed a persisted trunk (user + assistant forces the fresh-session flush).
    const seed = sdk.SessionManager.create(cwd, sessionDir);
    seed.appendMessage(userMessage("trunk user"));
    seed.appendMessage(assistantMessage("trunk assistant"));
    const sessionFile = requireSessionFile(seed);

    // Both writers open the same file. open() reads the tree and leaves each
    // manager flushed, so all later appends are plain line appends.
    const a = sdk.SessionManager.open(sessionFile, sessionDir);
    const b = sdk.SessionManager.open(sessionFile, sessionDir);

    // Interleave appends at row granularity, the worst-case write pattern.
    const aIds: string[] = [];
    const bIds: string[] = [];
    for (let index = 0; index < 5; index += 1) {
      aIds.push(a.appendMessage(userMessage(`a-${String(index)}`)));
      bIds.push(b.appendMessage(userMessage(`b-${String(index)}`)));
    }

    // File integrity: header row plus every appended entry is parseable JSONL.
    const raw = await readFile(sessionFile, "utf8");
    const entries = sdk.parseSessionEntries(raw);
    expect(entries.length).toBe(1 + 2 + aIds.length + bIds.length);

    // A fresh open sees one root and both branches intact.
    const fresh = sdk.SessionManager.open(sessionFile, sessionDir);
    expect(fresh.getTree()).toHaveLength(1);
    expect(messageTexts(fresh.getBranch(aIds[4]))).toEqual([
      "trunk user",
      "trunk assistant",
      "a-0",
      "a-1",
      "a-2",
      "a-3",
      "a-4",
    ]);
    expect(messageTexts(fresh.getBranch(bIds[4]))).toEqual([
      "trunk user",
      "trunk assistant",
      "b-0",
      "b-1",
      "b-2",
      "b-3",
      "b-4",
    ]);

    // Each writer's own stale view sees only its branch (plus the trunk):
    // no cross-branch leakage in either direction.
    expect(messageTexts(a.getBranch())).toEqual([
      "trunk user",
      "trunk assistant",
      "a-0",
      "a-1",
      "a-2",
      "a-3",
      "a-4",
    ]);
    expect(messageTexts(b.getBranch())).toEqual([
      "trunk user",
      "trunk assistant",
      "b-0",
      "b-1",
      "b-2",
      "b-3",
      "b-4",
    ]);
  });
});

describe.runIf(promptEnabled && existsSync(agentDir))(
  "real-pi same-session agents",
  () => {
    it("two live agents prompt on two branches of one session file", async () => {
      const sdk = await import("@earendil-works/pi-coding-agent");
      const tempDir = await mkdtemp(join(tmpdir(), "uix-branch-prompts-"));
      const cwd = join(tempDir, "cwd");
      const sessionDir = join(tempDir, "sessions");
      await mkdir(cwd, { recursive: true });
      await mkdir(sessionDir, { recursive: true });

      // Seed a persisted trunk so both managers open flushed and append-only.
      const seed = sdk.SessionManager.create(cwd, sessionDir);
      seed.appendMessage(userMessage("trunk user"));
      seed.appendMessage(assistantMessage("trunk assistant"));
      const sessionFile = requireSessionFile(seed);

      async function bootAgent(
        sessionManager: SessionManager,
      ): Promise<AgentSessionRuntime> {
        return sdk.createAgentSessionRuntime(
          async ({ sessionManager: manager }) => {
            const services = await sdk.createAgentSessionServices({
              cwd,
              agentDir,
              resourceLoaderOptions: { extensionFactories: [] },
            });
            const available = await services.modelRuntime.getAvailable();
            if (available.length === 0) {
              throw new Error("No authed model available for prompts");
            }
            // Prefer the workspace default model (some catalog entries can
            // complete a turn with an empty assistant message).
            const pick =
              available.find(
                (m) =>
                  m.provider === "deepseek" && m.id === "deepseek-v4-flash",
              ) ?? available[0];
            const model = services.modelRuntime.getModel(
              pick.provider,
              pick.id,
            );
            if (!model) throw new Error("Selected model is unavailable");
            const result = await sdk.createAgentSessionFromServices({
              services,
              sessionManager: manager,
              noTools: "builtin",
              model,
            });
            return {
              ...result,
              services,
              diagnostics: services.diagnostics,
            };
          },
          { cwd, agentDir, sessionManager },
        );
      }

      const managerA = sdk.SessionManager.open(sessionFile, sessionDir);
      const managerB = sdk.SessionManager.open(sessionFile, sessionDir);
      const runtimeA = await bootAgent(managerA);
      const runtimeB = await bootAgent(managerB);

      try {
        // Concurrent turns on the same session file, different branches.
        await Promise.all([
          runtimeA.session.prompt(
            "Reply with exactly the word alpha and nothing else.",
          ),
          runtimeB.session.prompt(
            "Reply with exactly the word beta and nothing else.",
          ),
        ]);

        // Each agent's own view holds its own branch only.
        const replyA = lastAssistantText(managerA);
        const replyB = lastAssistantText(managerB);
        expect(replyA).toBeDefined();
        expect(replyB).toBeDefined();
        expect(replyA).toMatch(/alpha/i);
        expect(replyB).toMatch(/beta/i);
        expect(replyA).not.toMatch(/beta/i);
        expect(replyB).not.toMatch(/alpha/i);

        // A fresh open sees both branches in the shared tree, both replies
        // persisted, no cross-talk, no corruption.
        const fresh = sdk.SessionManager.open(sessionFile, sessionDir);
        const freshAReply = lastAssistantTextFrom(fresh, managerA.getLeafId());
        const freshBReply = lastAssistantTextFrom(fresh, managerB.getLeafId());
        expect(freshAReply).toMatch(/alpha/i);
        expect(freshBReply).toMatch(/beta/i);
        expect(fresh.getTree()).toHaveLength(1);
        expect(
          sdk.parseSessionEntries(await readFile(sessionFile, "utf8")),
        ).toBeDefined();
      } finally {
        await runtimeA.dispose();
        await runtimeB.dispose();
        await rm(tempDir, { recursive: true, force: true });
      }
    }, 120_000);
  },
);

function lastAssistantText(manager: SessionManager): string | undefined {
  return lastAssistantTextFrom(manager, manager.getLeafId());
}

function lastAssistantTextFrom(
  manager: SessionManager,
  leafId: string | null,
): string | undefined {
  if (!leafId) return undefined;
  const texts = messageTexts(manager.getBranch(leafId));
  for (let index = texts.length - 1; index >= 0; index -= 1) {
    if (texts[index].trim() !== "") {
      return texts[index];
    }
  }
  return undefined;
}

function requireSessionFile(manager: SessionManager): string {
  const file = manager.getSessionFile();
  if (!file) throw new Error("Session file is unavailable");
  return file;
}
