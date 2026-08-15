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
  /** Begin the instance's only active turn, or reject when one is already active. */
  beginTurn(): Disposable;
  /** Boot the Pi runtime on first use. Concurrent callers share one attempt. */
  bootRuntime(): Promise<AgentSessionRuntime>;
  /** Reload an active or already-booting runtime without starting an unused one. */
  reloadRuntimeIfActive(): Promise<boolean>;
  /** Finalize branch work and dispose the Pi runtime and instance state. */
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
  /** Commit final turn state after the safe boundary. */
  readonly commitFinalTurnState?: (
    manager: SessionManager,
    state: AgentInstanceState,
  ) => Promise<void>;
  readonly state: AgentInstanceStateOptions;
}

/** Creates an independently disposable instance with lazy Pi runtime boot. */
export function createAgentInstance(opts: AgentInstanceOptions): AgentInstance {
  const state = createAgentInstanceState(opts.state);
  let runtime: AgentSessionRuntime | undefined;
  let inFlightRuntimeBoot: Promise<AgentSessionRuntime> | undefined;
  let disposal: Promise<void> | undefined;
  let turnActive = false;
  let disposed = false;

  function bootRuntime(): Promise<AgentSessionRuntime> {
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
    const bootedRuntime = runtime;
    const pendingBoot = inFlightRuntimeBoot;
    runtime = undefined;
    disposal = (async () => {
      const errors: unknown[] = [];
      try {
        await opts.commitFinalTurnState?.(opts.manager, state);
      } catch (error) {
        errors.push(error);
      }
      try {
        if (bootedRuntime) await bootedRuntime.dispose();
        else if (pendingBoot) await pendingBoot.catch(() => undefined);
      } catch (error) {
        errors.push(error);
      }
      try {
        state[Symbol.dispose]();
      } catch (error) {
        errors.push(error);
      }
      if (errors.length > 0) {
        throw new AggregateError(errors, "Agent instance disposal failed");
      }
    })();
    return disposal;
  }

  return {
    target: opts.target,
    manager: opts.manager,
    state,
    beginTurn() {
      if (disposed) throw new Error("Agent instance is disposed");
      if (turnActive) throw new Error("Agent is already running");
      turnActive = true;
      let ended = false;
      return {
        [Symbol.dispose]() {
          if (ended) return;
          ended = true;
          turnActive = false;
        },
      };
    },
    bootRuntime,
    async reloadRuntimeIfActive() {
      if (disposed) throw new Error("Agent instance is disposed");
      const activeRuntime = runtime ?? (await inFlightRuntimeBoot);
      if (!activeRuntime) return false;
      await activeRuntime.session.reload();
      return true;
    },
    dispose,
  };
}
