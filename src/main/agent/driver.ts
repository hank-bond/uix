// UIX cockpit — agent driver.
//
// Wraps `createAgentSession` from `@earendil-works/pi-coding-agent` and
// translates the subset of pi's event stream we currently render into
// the flat `AgentEvent` shape declared in src/shared/ipc.ts.
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

import type { AgentEvent, HistorySnapshot } from "../../shared/ipc";
import type { Workspace } from "../workspace";

import { join } from "node:path";

import { disposable, DisposableBag, subscribe } from "../lifecycle";
import { createLogger } from "../log";

import { type AgentBinding, createUixCoreExtension } from "./bindings";
import { entriesToMessages } from "./history";

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
  history(): Promise<HistorySnapshot>;
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
      subscribe<AgentSessionEvent>(session, (event) =>
        forwardEvent(event, opts.onEvent),
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
        return { messages: entriesToMessages(sessionManager.getBranch()) };
      } catch (err) {
        createLogger("agent").warn(
          { err: err instanceof Error ? err.message : String(err) },
          "history_load_failed",
        );
        return { messages: [] };
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
      opts.onEvent({ type: "user_message", text });
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
        // stored user entry stays clean. The user_message event above already
        // carries the human's original text to the renderer.
        await session.prompt(text);
      } catch (err) {
        opts.onEvent({
          type: "error",
          message: err instanceof Error ? err.message : String(err),
        });
        // Renderer treats assistant_end as "you can send again" — emit
        // it on error so the composer unlocks.
        opts.onEvent({ type: "assistant_end" });
      }
    },

    [Symbol.dispose]() {
      bag[Symbol.dispose]();
      sessionPromise = undefined;
      managerPromise = undefined;
    },
  };
}

function forwardEvent(
  event: AgentSessionEvent,
  emit: (e: AgentEvent) => void,
): void {
  switch (event.type) {
    case "message_update": {
      const inner = event.assistantMessageEvent;
      if (inner.type === "text_delta") {
        emit({ type: "assistant_delta", delta: inner.delta });
      }
      return;
    }
    case "agent_end":
      emit({ type: "assistant_end" });
      return;
    default:
      // Tool execution, turn lifecycle, queue updates, compaction, etc.
      // get surfaced when we have UI for them.
      return;
  }
}
