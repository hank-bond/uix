// private state lifecycle registry.
//
// State contributions prepare cockpit-private session entries at run
// boundaries. Unlike model-visible state messages, this pathway records
// durable refs the substrate needs to interpret a branch later.
//
// This is a singleton facet: at most one contribution per feature. The
// featureId itself serves as the canonical id under the `uix.turn-state`
// blob; the registry dedup key is `${featureId}.state`.

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

import { toContributionId, type ContributionId } from "#shared/contribution-id";
import { DisposableBag } from "../lifecycle";
import type { AgentInstaller } from "../agent/installers";

const TurnStateEntryType = "uix.turn-state";

type MaybePromise<T> = T | Promise<T>;

// ---- canonical id brand ----

const StateCanonicalIdBrand: unique symbol = Symbol("StateCanonicalId");

export type StateCanonicalId = string & {
  readonly [StateCanonicalIdBrand]: true;
};

/**
 * Builds the canonical id for a private-state contribution (`featureId`).
 * Validates the feature id against the shared token grammar; a failure is
 * an app bug.
 */
function toStateCanonicalId(featureId: string): StateCanonicalId {
  assertStateToken("feature id", featureId);
  return featureId as StateCanonicalId;
}

function assertStateToken(label: string, token: string): void {
  const pattern = /^[a-z][a-z0-9_-]*$/;
  if (!pattern.test(token)) {
    throw new Error(`Invalid ${label}: ${token}. Expected ${pattern}.`);
  }
}

export interface StatePreparationContext {
  cwd: string;
}

export interface PreparedState {
  state: unknown;
}

/**
 * A private-state contribution from a feature. Exactly one per feature.
 * Preparation callbacks are optional — a contribution that declares neither
 * is valid but inert.
 */
export interface StateContribution {
  prepareUserSubmitState?: (
    ctx: StatePreparationContext,
  ) => MaybePromise<PreparedState | undefined>;
  prepareAgentEndState?: (
    ctx: StatePreparationContext,
  ) => MaybePromise<PreparedState | undefined>;
}

interface RegisteredStateContribution extends StateContribution {
  readonly contributionId: ContributionId;
  readonly canonicalId: StateCanonicalId;
}

/** Registry for private-state contributions. Features pass this to `registerStateContributions`; they never register directly. */
export class StateRegistry {
  readonly registeredContributions: RegisteredStateContribution[] = [];
}

export function createStateRegistry(): StateRegistry {
  return new StateRegistry();
}

/** The sole registration path for private-state contributions. Derives both ids, enforces the singleton-per-feature invariant, and returns a Disposable. */
export function registerStateContributions(
  registry: StateRegistry,
  featureId: string,
  contributions: readonly StateContribution[],
): Disposable {
  if (contributions.length > 1) {
    throw new Error(
      `Feature ${featureId} contributes more than one private-state contribution. This is a singleton facet: at most one per feature.`,
    );
  }

  if (contributions.length === 0) return new DisposableBag();

  const contribution = contributions[0];
  const canonicalId = toStateCanonicalId(featureId);
  const contributionId = toContributionId(featureId, "state");

  if (
    registry.registeredContributions.some(
      (e) => e.contributionId === contributionId,
    )
  ) {
    throw new Error(
      `State contribution already registered: ${contributionId as string}`,
    );
  }

  const registered: RegisteredStateContribution = {
    ...contribution,
    contributionId,
    canonicalId,
  };

  registry.registeredContributions.push(registered);

  return {
    [Symbol.dispose]: (): void => {
      const index = registry.registeredContributions.indexOf(registered);
      if (index !== -1) registry.registeredContributions.splice(index, 1);
    },
  };
}

export function createStateCoordinator(state: StateRegistry): AgentInstaller {
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
  state: StateRegistry,
  installedContributions: readonly RegisteredStateContribution[],
): readonly RegisteredStateContribution[] {
  return installedContributions.filter((contribution) =>
    state.registeredContributions.includes(contribution),
  );
}

async function appendPreparedTurnState(
  pi: ExtensionAPI,
  opts: {
    cwd: string;
    contributions: readonly RegisteredStateContribution[];
    select: (
      contribution: RegisteredStateContribution,
    ) => RegisteredStateContribution["prepareUserSubmitState"];
  },
): Promise<void> {
  const preparedState: Record<string, unknown> = {};

  for (const contribution of opts.contributions) {
    const prepare = opts.select(contribution);
    if (!prepare) continue;

    const prepared = await prepare({ cwd: opts.cwd });
    if (!prepared) continue;
    preparedState[contribution.canonicalId] = prepared.state;
  }

  if (Object.keys(preparedState).length === 0) return;
  pi.appendEntry(TurnStateEntryType, { state: preparedState, cwd: opts.cwd });
}
