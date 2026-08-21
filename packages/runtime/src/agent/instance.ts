// Owns one live Pi execution, active-turn cancellation, and mutable state at one session-branch viewpoint.

import type {
  AgentSessionRuntime,
  SessionManager,
} from "@earendil-works/pi-coding-agent";

import {
  type AgentCompositionInstaller,
  type AgentCompositionInstance,
  type AgentCompositionInstanceOwnership,
  createAgentCompositionInstance,
} from "./composition";
import type {
  AgentCompositionDefinition,
  AgentFeatureDefinition,
} from "./composition-definition";
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
  /** Viewpoint-local feature states and registries when using the composition engine. */
  readonly featureComposition?: AgentCompositionInstance;
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
  readonly featureComposition?: AgentCompositionInstanceOwnership;
}

interface ComposedAgentInstanceOptions extends Omit<
  AgentInstanceOptions,
  "createRuntime" | "featureComposition"
> {
  readonly composition: AgentCompositionDefinition;
  readonly createFeatureStateBase: (feature: AgentFeatureDefinition) => object;
  readonly createRuntime: (
    manager: SessionManager,
    state: AgentInstanceState,
    features: AgentCompositionInstance & AgentCompositionInstaller,
  ) => Promise<AgentSessionRuntime>;
}

/** Creates an independently disposable instance with lazy Pi runtime boot. */
export function createAgentInstance(
  opts: AgentInstanceOptions,
): AgentInstanceOwnership {
  const state = createAgentInstanceState(opts.state);
  const featureCompositionOwnership = opts.featureComposition;
  const featureComposition = featureCompositionOwnership
    ? {
        definition: featureCompositionOwnership.definition,
        featureStates: featureCompositionOwnership.featureStates,
        registries: featureCompositionOwnership.registries,
        listOutcomes: () => featureCompositionOwnership.listOutcomes(),
      }
    : undefined;
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
      try {
        await featureCompositionOwnership?.[Symbol.asyncDispose]();
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
    ...(featureComposition && { featureComposition }),
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

/** Construct one Agent instance from a fresh feature composition. */
export async function createComposedAgentInstance(
  opts: ComposedAgentInstanceOptions,
): Promise<AgentInstanceOwnership> {
  const featureComposition = await createAgentCompositionInstance({
    definition: opts.composition,
    createFeatureStateBase: opts.createFeatureStateBase,
  });
  const installableComposition: AgentCompositionInstance &
    AgentCompositionInstaller = {
    definition: featureComposition.definition,
    featureStates: featureComposition.featureStates,
    registries: featureComposition.registries,
    listOutcomes: () => featureComposition.listOutcomes(),
    install: (pi) => featureComposition.install(pi),
  };
  try {
    return createAgentInstance({
      target: opts.target,
      manager: opts.manager,
      state: opts.state,
      featureComposition,
      createRuntime: (manager, state) =>
        opts.createRuntime(manager, state, installableComposition),
      ...(opts.commitFinalTurnState && {
        commitFinalTurnState: opts.commitFinalTurnState,
      }),
    });
  } catch (creationError) {
    try {
      await featureComposition[Symbol.asyncDispose]();
    } catch (disposalError) {
      throw new AggregateError(
        [creationError, disposalError],
        "Agent instance creation and composition rollback failed",
        { cause: disposalError },
      );
    }
    throw creationError;
  }
}
