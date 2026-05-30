// Trellis cockpit — agent driver.
//
// Wraps `createAgentSession` from `@earendil-works/pi-coding-agent` and
// translates the subset of pi's event stream we currently render into the
// flat `AgentEvent` shape declared in src/shared/ipc.ts.
//
// Why dynamic `import()`: pi is an ESM-only package and the main bundle
// is CJS (the format Electron's sandboxed preload also has to use). A
// static `import` would be rewritten to `require()` by the bundler and
// fail at runtime. Dynamic `import()` is preserved through the build
// and runs as a real ESM load.
//
// The accompanying `import type` lines are erased at compile time, so
// we still get full pi types in the IDE/typechecker without any runtime
// cost. Inference handles the rest.

import type { AgentSessionEvent } from "@earendil-works/pi-coding-agent";

import type { AgentEvent } from "../shared/ipc";

export interface AgentDriver {
  prompt(text: string): Promise<void>;
  dispose(): Promise<void>;
}

export interface AgentDriverOptions {
  /** Forwarded for the renderer to consume. */
  onEvent: (event: AgentEvent) => void;
}

export function createAgentDriver(opts: AgentDriverOptions): AgentDriver {
  // Session is built lazily on first prompt so missing API keys surface
  // as an in-conversation error rather than a launch crash. Type is
  // inferred from `createAgentSession`'s return.
  let sessionPromise:
    | ReturnType<typeof openSession>
    | undefined;
  let unsubscribe: (() => void) | undefined;

  async function openSession() {
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
    });

    unsubscribe = session.subscribe((event) => {
      forwardEvent(event, opts.onEvent);
    });

    return session;
  }

  return {
    async prompt(text) {
      opts.onEvent({ type: "user_message", text });
      try {
        // If openSession rejects (e.g. missing auth), clear the cache
        // so the next prompt tries fresh instead of replaying the
        // failure forever. Failures *inside* an established session
        // — e.g. a bad prompt mid-stream — don't reach this catch path
        // since they're surfaced through the event stream, not as a
        // thrown error from prompt().
        sessionPromise ??= openSession().catch((err) => {
          sessionPromise = undefined;
          throw err;
        });
        const session = await sessionPromise;
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

    async dispose() {
      try {
        unsubscribe?.();
        if (sessionPromise) {
          const session = await sessionPromise;
          session.dispose();
        }
      } catch {
        // Swallow on shutdown.
      }
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
