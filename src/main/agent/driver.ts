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
} from "@earendil-works/pi-coding-agent";

import type { AgentEvent } from "../../shared/ipc";

import { disposable, DisposableBag, subscribe } from "../lifecycle";

import {
  type AgentBinding,
  collectAgentBindingContext,
  collectAgentBindingTools,
} from "./bindings";

/**
 * The driver itself is a Disposable so callers can hand it to a Bag
 * and forget about it.
 */
export interface AgentDriver extends Disposable {
  prompt(text: string): Promise<void>;
  /** Reload pi resources if a session already exists. */
  reload(): Promise<boolean>;
}

export interface AgentDriverOptions {
  /** Forwarded to the renderer (over IPC). */
  onEvent: (event: AgentEvent) => void;
  /** Core UIX capabilities bound into the pi-backed session. */
  agentBindings?: readonly AgentBinding[];
}

export function createAgentDriver(opts: AgentDriverOptions): AgentDriver {
  // Holds everything that needs teardown for this driver's lifetime:
  // the subscription to pi's event stream, and (once it exists) the
  // session itself.
  const bag = new DisposableBag();

  // Cached promise of the session. We cache the *promise*, not the
  // resolved value, so concurrent first-callers share one init.
  let sessionPromise: Promise<AgentSession> | undefined;

  async function openSession(): Promise<AgentSession> {
    const sdk = await import("@earendil-works/pi-coding-agent");
    const authStorage = sdk.AuthStorage.create();
    const modelRegistry = sdk.ModelRegistry.create(authStorage);

    const { session } = await sdk.createAgentSession({
      // In-memory for now: the cockpit doesn't yet have a "choose
      // project" UI, and we don't want to scribble session files into
      // wherever the dev launched electron from. Swap to
      // SessionManager.create(cwd) once project selection lands.
      sessionManager: sdk.SessionManager.inMemory(),
      authStorage,
      modelRegistry,
      customTools: collectAgentBindingTools(opts.agentBindings ?? []),
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
        // Prepend any binding-contributed turn context (e.g. the canvas
        // human-writeback diff) to the outgoing prompt. The user_message event
        // above carries the human's original text
        const context = await collectAgentBindingContext(
          opts.agentBindings ?? [],
        );
        await session.prompt(context ? `${context}\n\n${text}` : text);
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
