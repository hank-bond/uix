// Owns one live Pi execution, active-turn cancellation, and mutable state at one session-branch viewpoint.

import type {
  AgentSessionRuntime,
  SessionManager,
} from "@earendil-works/pi-coding-agent";

import {
  type AgentInstanceState,
  type AgentInstanceStateOptions,
  createAgentInstanceState,
} from "./instance-state";
import type { OperationControl } from "../operation-tracker";
import type { SessionTarget } from "../workspace";

export interface AgentInstance {
  readonly target: SessionTarget;
  readonly manager: SessionManager;
  readonly state: AgentInstanceState;
  /** Register the instance's only active turn, or reject when one is already active. */
  registerActiveTurn(control: OperationControl): Disposable;
  /** Request cancellation and await the active turn's lexical completion. */
  cancelActiveTurn(reason?: unknown): Promise<boolean>;
  /** Whether this instance currently has a registered active turn. */
  isTurnActive(): boolean;
  /** Boot the Pi runtime on first use. Concurrent callers share one attempt. */
  bootRuntime(): Promise<AgentSessionRuntime>;
  /** Reload an active or already-booting runtime without starting an unused one. */
  reloadRuntimeIfActive(): Promise<boolean>;
}

/** Supervisor-only instance capability adding asynchronous lifecycle authority. */
export type AgentInstanceOwnership = AgentInstance & AsyncDisposable;

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
export function createAgentInstance(
  opts: AgentInstanceOptions,
): AgentInstanceOwnership {
  const state = createAgentInstanceState(opts.state);
  let runtime: AgentSessionRuntime | undefined;
  let inFlightRuntimeBoot: Promise<AgentSessionRuntime> | undefined;
  let disposal: Promise<void> | undefined;
  let activeTurn: OperationControl | undefined;

  function bootRuntime(): Promise<AgentSessionRuntime> {
    if (runtime) return Promise.resolve(runtime);
    if (inFlightRuntimeBoot) return inFlightRuntimeBoot;

    const boot = opts
      .createRuntime(opts.manager, state)
      .then((bootedRuntime) => {
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
        let runtimeToDispose = bootedRuntime;
        if (!runtimeToDispose && pendingBoot) {
          runtimeToDispose = await pendingBoot.catch(() => undefined);
          runtime = undefined;
        }
        await runtimeToDispose?.dispose();
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
    registerActiveTurn(control) {
      if (activeTurn) throw new Error("Agent is already running");
      activeTurn = control;
      let ended = false;
      return {
        [Symbol.dispose]() {
          if (ended) return;
          ended = true;
          if (activeTurn === control) activeTurn = undefined;
        },
      };
    },
    async cancelActiveTurn(reason) {
      if (!activeTurn) return false;
      await activeTurn.cancel(reason);
      return true;
    },
    isTurnActive: () => activeTurn !== undefined,
    bootRuntime,
    async reloadRuntimeIfActive() {
      const activeRuntime = runtime ?? (await inFlightRuntimeBoot);
      if (!activeRuntime) return false;
      await activeRuntime.session.reload();
      return true;
    },
    [Symbol.asyncDispose]: dispose,
  };
}
