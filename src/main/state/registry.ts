// UIX cockpit — private state lifecycle registry.
//
// State contributions prepare cockpit-private session entries at run
// boundaries. Unlike model-visible state messages, this pathway records
// durable refs the substrate needs to interpret a branch later.

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

import { DisposableBag } from "../lifecycle";
import type { AgentInstaller } from "../agent/installers";

const TurnStateEntryType = "uix.turn-state";

type MaybePromise<T> = T | Promise<T>;

export interface StatePreparationContext {
  cwd: string;
}

export interface PreparedState {
  state: unknown;
}

export interface StateContribution {
  id: string;
  prepareUserSubmitState?: (
    ctx: StatePreparationContext,
  ) => MaybePromise<PreparedState | undefined>;
  prepareAgentEndState?: (
    ctx: StatePreparationContext,
  ) => MaybePromise<PreparedState | undefined>;
}

export interface StateRegistry {
  register(contribution: StateContribution): Disposable;
}

class RegisteredStateContributions implements StateRegistry {
  readonly registeredContributions: StateContribution[] = [];

  register(contribution: StateContribution): Disposable {
    if (this.registeredContributions.some((e) => e.id === contribution.id)) {
      throw new Error(
        `State contribution already registered: ${contribution.id}`,
      );
    }

    this.registeredContributions.push(contribution);

    return {
      [Symbol.dispose]: (): void => {
        const index = this.registeredContributions.indexOf(contribution);
        if (index !== -1) this.registeredContributions.splice(index, 1);
      },
    };
  }
}

export function createStateRegistry(): StateRegistry {
  return new RegisteredStateContributions();
}

export function registerStateContributions(
  registry: StateRegistry,
  contributions: readonly StateContribution[],
): Disposable {
  const bag = new DisposableBag();
  for (const contribution of contributions) {
    bag.add(registry.register(contribution));
  }
  return bag;
}

export function createStateCoordinator(state: StateRegistry): AgentInstaller {
  if (!(state instanceof RegisteredStateContributions)) {
    throw new Error("createStateCoordinator requires createStateRegistry()");
  }

  return (pi) => {
    const installedContributions = [...state.registeredContributions];

    pi.on("input", async (_event, ctx) => {
      await appendPreparedTurnState(pi, {
        cwd: ctx.cwd,
        contributions: liveContributions(state, installedContributions),
        select: (contribution) => contribution.prepareUserSubmitState,
      });
    });

    pi.on("agent_end", async (_event, ctx) => {
      await appendPreparedTurnState(pi, {
        cwd: ctx.cwd,
        contributions: liveContributions(state, installedContributions),
        select: (contribution) => contribution.prepareAgentEndState,
      });
    });
  };
}

function liveContributions(
  state: RegisteredStateContributions,
  installedContributions: readonly StateContribution[],
): readonly StateContribution[] {
  return installedContributions.filter((contribution) =>
    state.registeredContributions.includes(contribution),
  );
}

async function appendPreparedTurnState(
  pi: ExtensionAPI,
  opts: {
    cwd: string;
    contributions: readonly StateContribution[];
    select: (
      contribution: StateContribution,
    ) => StateContribution["prepareUserSubmitState"];
  },
): Promise<void> {
  const preparedState: Record<string, unknown> = {};

  for (const contribution of opts.contributions) {
    const prepare = opts.select(contribution);
    if (!prepare) continue;

    const prepared = await prepare({ cwd: opts.cwd });
    if (!prepared) continue;
    preparedState[contribution.id] = prepared.state;
  }

  if (Object.keys(preparedState).length === 0) return;
  pi.appendEntry(TurnStateEntryType, { state: preparedState, cwd: opts.cwd });
}
