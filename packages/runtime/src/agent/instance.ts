// Owns one live Pi execution and its mutable state at one immutable session-branch viewpoint.

import type {
  AgentSessionRuntime,
  SessionManager,
} from "@earendil-works/pi-coding-agent";

import {
  type AgentInstanceState,
  type AgentInstanceStateOptions,
  createAgentInstanceState,
} from "./instance-state";
import type { SessionTarget } from "../workspace";

export interface AgentInstance {
  readonly target: SessionTarget;
  readonly manager: SessionManager;
  readonly state: AgentInstanceState;
  /** Boot the Pi runtime on first use. Concurrent callers share one attempt. */
  getRuntime(): Promise<AgentSessionRuntime>;
  /** Reload an active or already-booting runtime without starting an unused one. */
  reloadRuntimeIfActive(): Promise<boolean>;
  /** Dispose now when idle, or after the active turn. Abort cancels teardown. */
  disposeAtSafeTurnBoundary(signal: AbortSignal): Promise<boolean>;
  dispose(): Promise<void>;
}

export interface AgentInstanceOptions {
  /** The accepted immutable target and its independently opened manager. */
  readonly target: SessionTarget;
  readonly manager: SessionManager;
  readonly createRuntime: (
    manager: SessionManager,
    state: AgentInstanceState,
  ) => Promise<AgentSessionRuntime>;
  readonly state: AgentInstanceStateOptions;
}

/** Creates an independently disposable instance with lazy Pi runtime boot. */
export function createAgentInstance(opts: AgentInstanceOptions): AgentInstance {
  const state = createAgentInstanceState(opts.state);
  let runtime: AgentSessionRuntime | undefined;
  let inFlightRuntimeBoot: Promise<AgentSessionRuntime> | undefined;
  let disposal: Promise<void> | undefined;
  let disposed = false;

  function getRuntime(): Promise<AgentSessionRuntime> {
    if (disposed) {
      return Promise.reject(new Error("Agent instance is disposed"));
    }
    if (runtime) return Promise.resolve(runtime);
    if (inFlightRuntimeBoot) return inFlightRuntimeBoot;

    const boot = opts
      .createRuntime(opts.manager, state)
      .then(async (bootedRuntime) => {
        if (disposed) {
          await bootedRuntime.dispose();
          throw new Error("Agent instance is disposed");
        }
        runtime = bootedRuntime;
        return bootedRuntime;
      })
      .finally(() => {
        if (inFlightRuntimeBoot === boot) inFlightRuntimeBoot = undefined;
      });
    inFlightRuntimeBoot = boot;
    return boot;
  }

  function dispose(): Promise<void> {
    if (disposal) return disposal;
    disposed = true;
    state[Symbol.dispose]();
    const bootedRuntime = runtime;
    const pendingBoot = inFlightRuntimeBoot;
    runtime = undefined;
    disposal = bootedRuntime
      ? bootedRuntime.dispose()
      : pendingBoot
        ? pendingBoot.then(
            () => undefined,
            () => undefined,
          )
        : Promise.resolve();
    return disposal;
  }

  return {
    target: opts.target,
    manager: opts.manager,
    state,
    getRuntime,
    async reloadRuntimeIfActive() {
      if (disposed) throw new Error("Agent instance is disposed");
      const activeRuntime = runtime ?? (await inFlightRuntimeBoot);
      if (!activeRuntime) return false;
      await activeRuntime.session.reload();
      return true;
    },
    async disposeAtSafeTurnBoundary(signal) {
      if (disposed) {
        await disposal;
        return true;
      }
      let activeRuntime = runtime;
      if (!activeRuntime && inFlightRuntimeBoot) {
        try {
          activeRuntime = await inFlightRuntimeBoot;
        } catch {
          if (signal.aborted) return false;
          await dispose();
          return true;
        }
      }
      if (signal.aborted) return false;
      if (activeRuntime?.session.isStreaming) {
        const reachedBoundary = await waitForAgentEnd(activeRuntime, signal);
        if (!reachedBoundary) return false;
      }
      await dispose();
      return true;
    },
    dispose,
  };
}

function waitForAgentEnd(
  runtime: AgentSessionRuntime,
  signal: AbortSignal,
): Promise<boolean> {
  return new Promise((resolve) => {
    let settled = false;
    let unsubscribe = (): void => undefined;
    const finish = (reachedBoundary: boolean): void => {
      if (settled) return;
      settled = true;
      unsubscribe();
      signal.removeEventListener("abort", onAbort);
      resolve(reachedBoundary);
    };
    const onAbort = (): void => {
      finish(false);
    };
    unsubscribe = runtime.session.subscribe((event) => {
      if (event.type === "agent_end") finish(true);
    });
    signal.addEventListener("abort", onAbort, { once: true });
    if (signal.aborted) finish(false);
    else if (!runtime.session.isStreaming) finish(true);
  });
}
