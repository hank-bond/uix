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
  readonly runtime: AgentSessionRuntime;
  readonly state: AgentInstanceState;
  dispose(): Promise<void>;
}

export interface AgentInstanceOptions {
  readonly target: SessionTarget;
  /** Opens and positions an independent manager at this target's branch end. */
  readonly openManager: (target: SessionTarget) => Promise<SessionManager>;
  readonly createRuntime: (
    manager: SessionManager,
    state: AgentInstanceState,
  ) => Promise<AgentSessionRuntime>;
  readonly state: AgentInstanceStateOptions;
}

/** Boots one independently disposable agent instance for a fixed target. */
export async function createAgentInstance(
  opts: AgentInstanceOptions,
): Promise<AgentInstance> {
  const state = createAgentInstanceState(opts.state);
  try {
    const manager = await opts.openManager(opts.target);
    const runtime = await opts.createRuntime(manager, state);
    let disposal: Promise<void> | undefined;
    return {
      target: opts.target,
      manager,
      runtime,
      state,
      dispose() {
        if (disposal) return disposal;
        state[Symbol.dispose]();
        disposal = runtime.dispose();
        return disposal;
      },
    };
  } catch (error) {
    state[Symbol.dispose]();
    throw error;
  }
}
