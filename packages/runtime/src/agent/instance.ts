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
  dispose(): Promise<void>;
}

export interface AgentInstanceOptions {
  readonly target: SessionTarget;
  /** Opens the independent manager for this primary session target. */
  readonly openManager: (target: SessionTarget) => Promise<SessionManager>;
  readonly createRuntime: (
    manager: SessionManager,
    state: AgentInstanceState,
  ) => Promise<AgentSessionRuntime>;
  readonly state: AgentInstanceStateOptions;
}

/** Boots one manager and its independently disposable, lazy agent instance. */
export async function createAgentInstance(
  opts: AgentInstanceOptions,
): Promise<AgentInstance> {
  const state = createAgentInstanceState(opts.state);
  let runtime: AgentSessionRuntime | undefined;
  let inFlightRuntimeBoot: Promise<AgentSessionRuntime> | undefined;
  let disposal: Promise<void> | undefined;
  let disposed = false;

  try {
    const manager = await opts.openManager(opts.target);

    function getRuntime(): Promise<AgentSessionRuntime> {
      if (disposed) {
        return Promise.reject(new Error("Agent instance is disposed"));
      }
      if (runtime) return Promise.resolve(runtime);
      if (inFlightRuntimeBoot) return inFlightRuntimeBoot;

      const boot = opts
        .createRuntime(manager, state)
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

    return {
      target: opts.target,
      manager,
      state,
      getRuntime,
      async reloadRuntimeIfActive() {
        if (disposed) throw new Error("Agent instance is disposed");
        const activeRuntime = runtime ?? (await inFlightRuntimeBoot);
        if (!activeRuntime) return false;
        await activeRuntime.session.reload();
        return true;
      },
      dispose() {
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
      },
    };
  } catch (error) {
    state[Symbol.dispose]();
    throw error;
  }
}
