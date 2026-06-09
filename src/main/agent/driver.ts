// UIX cockpit — agent driver.
//
// Wraps `createAgentSession` from `@earendil-works/pi-coding-agent` and
// normalizes pi's live event stream into the same transcript item model used
// for persisted history replay in src/shared/ipc.ts.
//
// Why dynamic `import()`: pi is an ESM-only package and the main bundle
// is CJS. A static `import` would be rewritten to `require()` by the
// bundler and fail at runtime. Dynamic `import()` is preserved through
// the build and runs as a real ESM load. The `import type` line beside
// it is erased at compile time, so we still get full pi types in the
// IDE/typechecker without any runtime cost.
//
// Lifetime management uses the conventions in src/main/lifecycle.ts:
// every cleanup-requiring registration goes into the driver's
// DisposableBag, and disposing the driver tears everything down at
// once.

import type {
  AgentSession,
  AgentSessionEvent,
  SessionManager,
} from "@earendil-works/pi-coding-agent";

import type {
  AgentEvent,
  TranscriptItem,
  TranscriptSnapshot,
} from "../../shared/ipc";
import type { Workspace } from "../workspace";

import { join } from "node:path";

import { disposable, DisposableBag, subscribe } from "../lifecycle";
import { createLogger } from "../log";

import { type AgentBinding, createUixCoreExtension } from "./bindings";
import {
  extractTranscriptText,
  parseCustomTranscriptItem,
  getMessageRole,
  toIpcValue,
  toTranscriptItems,
} from "./transcript";

/**
 * The driver itself is a Disposable so callers can hand it to a Bag
 * and forget about it.
 */
export interface AgentDriver extends Disposable {
  prompt(text: string): Promise<void>;
  /** Reload pi resources if a session already exists. */
  reload(): Promise<boolean>;
  /**
   * Kick the eager, auth-free session-manager load off the boot path. Safe to
   * call before any prompt; lets history() resolve without waiting on a prompt.
   */
  init(): void;
  /** Prior transcript for renderer rehydration. Needs only the manager tier. */
  history(): Promise<TranscriptSnapshot>;
}

export interface AgentDriverOptions {
  /** Forwarded to the renderer (over IPC). */
  onEvent: (event: AgentEvent) => void;
  /** UIX-core agent bindings composed into the in-process pi extension. */
  agentBindings?: readonly AgentBinding[];
  /** State root (pins the session dir) + agent cwd. */
  workspace: Workspace;
}

export function createAgentDriver(opts: AgentDriverOptions): AgentDriver {
  // Holds everything that needs teardown for this driver's lifetime:
  // the subscription to pi's event stream, and (once it exists) the
  // session itself.
  const bag = new DisposableBag();

  // Two tiers, cached as *promises* so concurrent first-callers share one init.
  //
  //   manager — cheap, auth-free: just loads the session file. Eager (init()),
  //     off the boot path, so history() resolves fast.
  //   session — expensive: auth + model registry + the live agent. Lazy, on
  //     first prompt, so app paint never blocks on it.
  let managerPromise: Promise<SessionManager> | undefined;
  let sessionPromise: Promise<AgentSession> | undefined;

  // Single accessor so both tiers share one manager. On failure, clear the
  // cache so the next caller retries instead of replaying a stale rejection.
  function manager(): Promise<SessionManager> {
    return (managerPromise ??= openManager().catch((err) => {
      managerPromise = undefined;
      throw err;
    }));
  }

  async function openManager(): Promise<SessionManager> {
    const sdk = await import("@earendil-works/pi-coding-agent");
    const { stateRoot, agentCwd } = opts.workspace;
    // Pin the session dir under .uix on the stable state root, not pi's
    // cwd-derived default, so the session file stays with the canvases and does
    // not move when the agent later relocates to a worktree.
    const sessionDir = join(stateRoot, ".uix", "sessions");
    // Resume the most recent session for this cwd; create one only when none
    // exists. File-backing alone would start empty every launch — "survives
    // restart" means resume.
    try {
      return sdk.SessionManager.continueRecent(agentCwd, sessionDir);
    } catch {
      return sdk.SessionManager.create(agentCwd, sessionDir);
    }
  }

  async function openSession(): Promise<AgentSession> {
    const sdk = await import("@earendil-works/pi-coding-agent");
    const sessionManager = await manager();
    const authStorage = sdk.AuthStorage.create();
    const modelRegistry = sdk.ModelRegistry.create(authStorage);

    // UIX-core agent contributions (tools + the per-turn context hook) ride a
    // single in-process pi extension. Load it through a DefaultResourceLoader
    // with the same cwd/agentDir createAgentSession would default to, so user
    // pi resources still discover and our factory holds the live ExtensionAPI.
    const resourceLoader = new sdk.DefaultResourceLoader({
      cwd: opts.workspace.agentCwd,
      agentDir: sdk.getAgentDir(),
      extensionFactories: [createUixCoreExtension(opts.agentBindings ?? [])],
    });
    await resourceLoader.reload();

    const { session } = await sdk.createAgentSession({
      cwd: opts.workspace.agentCwd,
      sessionManager,
      authStorage,
      modelRegistry,
      resourceLoader,
    });

    // Both registrations land in the bag, so a single dispose tears
    // them down in LIFO order: the subscription first, then the
    // session itself.
    bag.add(
      subscribe<AgentSessionEvent>(
        session,
        createLiveTranscriptForwarder(opts.onEvent),
      ),
    );
    bag.add(disposable(() => session.dispose()));

    return session;
  }

  return {
    init() {
      // Fire the eager manager load; swallow rejection here so an early failure
      // doesn't surface as an unhandled rejection. prompt()/history() retry.
      void manager().catch(() => {});
    },

    async history() {
      try {
        const sessionManager = await manager();
        return { items: toTranscriptItems(sessionManager.getBranch()) };
      } catch (err) {
        createLogger("agent").warn(
          { err: err instanceof Error ? err.message : String(err) },
          "history_load_failed",
        );
        return { items: [] };
      }
    },

    async reload() {
      // Do not create a pi session solely to service a cockpit reload.
      // If a session is already open (or opening), delegate to pi's own
      // reload path so pi extensions, skills, prompts, themes, settings,
      // and context files are refreshed with pi's native semantics.
      if (!sessionPromise) return false;
      const session = await sessionPromise;
      await session.reload();
      return true;
    },

    async prompt(text) {
      opts.onEvent({
        type: "transcript_append",
        item: { id: liveId("user"), kind: "user", text },
      });
      try {
        // If openSession rejects (e.g. missing auth), clear the cache
        // so the next prompt tries fresh instead of replaying the
        // failure forever. Failures *inside* an established session
        // surface through the event stream, not via a thrown error
        // from prompt().
        sessionPromise ??= openSession().catch((err) => {
          sessionPromise = undefined;
          throw err;
        });
        const session = await sessionPromise;
        // Send the human's text verbatim. Binding-contributed turn context
        // (e.g. the canvas human-writeback diff) is prepended to the
        // model-bound text inside the UIX-core extension's "input" hook, so the
        // stored user entry stays clean. The transcript append above already
        // carries the human's original text to the renderer.
        await session.prompt(text);
      } catch (err) {
        opts.onEvent({
          type: "transcript_append",
          item: {
            id: liveId("error"),
            kind: "error",
            message: errorMessage(err),
          },
        });
        // Renderer treats agent_end as "you can send again" — emit it on error
        // so the composer unlocks.
        opts.onEvent({ type: "agent_end" });
      }
    },

    [Symbol.dispose]() {
      bag[Symbol.dispose]();
      sessionPromise = undefined;
      managerPromise = undefined;
    },
  };
}

function createLiveTranscriptForwarder(emit: (e: AgentEvent) => void) {
  let assistant: Extract<TranscriptItem, { kind: "assistant" }> | undefined;
  const tools = new Map<string, Extract<TranscriptItem, { kind: "tool" }>>();

  function append(item: TranscriptItem): void {
    emit({ type: "transcript_append", item });
  }

  function replace(item: TranscriptItem): void {
    emit({ type: "transcript_replace", item });
  }

  function ensureAssistant(): Extract<TranscriptItem, { kind: "assistant" }> {
    if (assistant) return assistant;
    assistant = {
      id: liveId("assistant"),
      kind: "assistant",
      text: "",
      complete: false,
    };
    append(assistant);
    return assistant;
  }

  return (event: AgentSessionEvent): void => {
    switch (event.type) {
      case "agent_start":
        emit({ type: "agent_start" });
        return;

      case "turn_start":
        emit({ type: "turn_start" });
        return;

      case "turn_end":
        emit({ type: "turn_end" });
        return;

      case "message_start":
        if (getMessageRole(event.message) === "assistant") ensureAssistant();
        return;

      case "message_update": {
        const inner = event.assistantMessageEvent;
        if (inner.type === "text_delta") {
          const current = ensureAssistant();
          assistant = { ...current, text: current.text + inner.delta };
          replace(assistant);
        }
        return;
      }

      case "message_end": {
        const role = getMessageRole(event.message);
        if (role === "assistant") {
          const current = ensureAssistant();
          const finalText =
            extractTranscriptText(event.message) || current.text;
          assistant = {
            ...current,
            text: finalText,
            complete: true,
          };
          replace(assistant);
          assistant = undefined;
          return;
        }

        const custom = parseCustomTranscriptItem(
          liveId("custom"),
          event.message,
        );
        if (custom) append(custom);
        return;
      }

      case "tool_execution_start": {
        const item = {
          id: liveId("tool"),
          kind: "tool" as const,
          toolCallId: event.toolCallId,
          toolName: event.toolName,
          args: toIpcValue(event.args),
          complete: false,
        };
        tools.set(event.toolCallId, item);
        append(item);
        return;
      }

      case "tool_execution_update": {
        const current = tools.get(event.toolCallId);
        if (!current) return;
        const item = {
          ...current,
          toolName: event.toolName,
          partialResult: toIpcValue(event.partialResult),
        };
        tools.set(event.toolCallId, item);
        replace(item);
        return;
      }

      case "tool_execution_end": {
        const existing = tools.get(event.toolCallId);
        const current =
          existing ??
          ({
            id: liveId("tool"),
            kind: "tool" as const,
            toolCallId: event.toolCallId,
            toolName: event.toolName,
            complete: false,
          } satisfies Extract<TranscriptItem, { kind: "tool" }>);
        const item: Extract<TranscriptItem, { kind: "tool" }> = {
          id: current.id,
          kind: "tool",
          toolCallId: current.toolCallId,
          toolName: event.toolName,
          complete: true,
          args: current.args,
          result: toIpcValue(event.result),
          isError: event.isError,
        };
        tools.delete(event.toolCallId);
        if (existing) replace(item);
        else append(item);
        return;
      }

      case "agent_end":
        emit({ type: "agent_end" });
        return;

      default:
        return;
    }
  };
}

let nextLiveId = 1;
function liveId(kind: string): string {
  return `live:${kind}:${nextLiveId++}`;
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
