// Owns one live Pi execution, active-turn cancellation, and mutable feature state at one session viewpoint.

import type {
  AgentSessionRuntime,
  SessionManager,
} from "@earendil-works/pi-coding-agent";

import { deriveSelectedBranchProjection } from "./branch-projection";
import {
  type AgentInstanceState,
  type AgentInstanceStateOptions,
  createAgentInstanceState,
} from "./instance-state";
import { AgentContextRegistry } from "../agent-context/registry";
import { AgentSkillRegistry } from "../agent-skill-registry";
import { AgentSystemPromptRegistry } from "../agent-system-prompt-registry";
import { AgentToolRegistry } from "../agent-tools/registry";
import { AgentChannelHandlerRegistry } from "../channel-registry";
import type { AgentFeatureRegistries } from "../features/contributions";
import { AsyncDisposableBag } from "../lifecycle";
import type { OperationControl } from "../operation-tracker";
import { TurnStateRegistry } from "../turn-state";
import type { SessionTarget } from "../workspace";

export interface AgentInstance {
  readonly target: SessionTarget;
  readonly manager: SessionManager;
  readonly state: AgentInstanceState;
  readonly features: AgentFeatureRegistries;
  readonly featureChannels: AgentChannelHandlerRegistry;
  /** Register the instance's only active turn, or reject when one is already active. */
  registerActiveTurn(control: OperationControl): Disposable;
  /** Request cancellation and await the active turn's lexical completion. */
  cancelActiveTurn(reason?: unknown): Promise<boolean>;
  /** Whether this instance currently has a registered active turn. */
  isTurnActive(): boolean;
  /** Boot the Pi runtime on first use. Concurrent callers share one attempt. */
  bootRuntime(): Promise<AgentSessionRuntime>;
  /** Replace feature callbacks after Workspace reload and return cleanup failures. */
  reloadFeatures(): Promise<readonly unknown[]>;
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
    features: AgentFeatureRegistries,
  ) => Promise<AgentSessionRuntime>;
  /** Activate the current manifest's Agent factories into these stable registries. */
  readonly activateFeatures: (
    features: AgentFeatureRegistries,
    featuresBag: AsyncDisposableBag,
  ) => Promise<void>;
  /** Commit final turn state after the safe boundary. */
  readonly commitFinalTurnState?: (
    manager: SessionManager,
    state: AgentInstanceState,
  ) => Promise<void>;
  readonly state: Omit<
    AgentInstanceStateOptions,
    "initialTranscript" | "turnState"
  >;
}

/** Creates an independently disposable instance with lazy Pi runtime boot. */
export async function createAgentInstance(
  opts: AgentInstanceOptions,
): Promise<AgentInstanceOwnership> {
  const features: AgentFeatureRegistries = {
    channels: new AgentChannelHandlerRegistry(),
    agentTools: new AgentToolRegistry(),
    agentSystemPrompt: new AgentSystemPromptRegistry(),
    agentSkills: new AgentSkillRegistry(),
    turnState: new TurnStateRegistry(),
    agentContext: new AgentContextRegistry(),
  };
  const instanceBag = new AsyncDisposableBag();
  const featuresBag = instanceBag.add(new AsyncDisposableBag());
  let state: AgentInstanceState & Disposable;
  try {
    await opts.activateFeatures(features, featuresBag);
    state = instanceBag.add(
      createAgentInstanceState({
        ...opts.state,
        initialTranscript: deriveSelectedBranchProjection(
          opts.manager.getBranch(),
          opts.manager.getHeader()?.cwd || opts.manager.getCwd(),
        ).transcript,
        turnState: features.turnState,
      }),
    );
  } catch (error) {
    try {
      await instanceBag[Symbol.asyncDispose]();
    } catch (cleanupError) {
      throw new AggregateError(
        [error, cleanupError],
        "Agent instance creation and feature rollback failed",
        { cause: cleanupError },
      );
    }
    throw error;
  }
  let runtime: AgentSessionRuntime | undefined;
  let inFlightRuntimeBoot: Promise<AgentSessionRuntime> | undefined;
  let disposal: Promise<void> | undefined;
  let activeTurn: OperationControl | undefined;

  instanceBag.add({
    [Symbol.asyncDispose]: async () => {
      let runtimeToDispose = runtime;
      if (!runtimeToDispose && inFlightRuntimeBoot) {
        runtimeToDispose = await inFlightRuntimeBoot.catch(() => undefined);
      }
      runtime = undefined;
      await runtimeToDispose?.dispose();
    },
  });

  function bootRuntime(): Promise<AgentSessionRuntime> {
    if (runtime) return Promise.resolve(runtime);
    if (inFlightRuntimeBoot) return inFlightRuntimeBoot;

    const boot = opts
      .createRuntime(opts.manager, state, features)
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

  async function reloadFeatures(): Promise<readonly unknown[]> {
    if (activeTurn) throw new Error("Cannot reload features during a turn");
    const cleanupErrors: unknown[] = [];
    try {
      await featuresBag.clear();
    } catch (error) {
      cleanupErrors.push(error);
    }
    state.turnStateCoordinator?.clearRestoration();
    await opts.activateFeatures(features, featuresBag);
    return cleanupErrors;
  }

  function dispose(): Promise<void> {
    if (disposal) return disposal;
    disposal = (async () => {
      const errors: unknown[] = [];
      try {
        await opts.commitFinalTurnState?.(opts.manager, state);
      } catch (error) {
        errors.push(error);
      }
      try {
        await instanceBag[Symbol.asyncDispose]();
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
    features,
    featureChannels: features.channels,
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
    reloadFeatures,
    async reloadRuntimeIfActive() {
      const activeRuntime = runtime ?? (await inFlightRuntimeBoot);
      if (!activeRuntime) return false;
      await activeRuntime.session.reload();
      return true;
    },
    [Symbol.asyncDispose]: dispose,
  };
}
