// private state lifecycle registry.
//
// State contributions prepare cockpit-private session entries at run
// boundaries. Unlike model-visible agent context, this pathway records
// durable refs the substrate needs to interpret a branch later.
//
// This is a singleton facet: at most one contribution per feature. The
// featureId itself serves as the canonical id under the `uix.turn-state`
// blob; the registry dedup key is `${featureId}.state`.

import type {
  ExtensionAPI,
  SessionEntry,
} from "@earendil-works/pi-coding-agent";

import { toContributionId, type ContributionId } from "#shared/contribution-id";
import { DisposableBag } from "../lifecycle";
import type { AgentInstaller } from "../agent/installers";

const TurnStateEntryType = "uix.turn-state";

type MaybePromise<T> = T | Promise<T>;

// ---- canonical id brand ----

const TurnStateCanonicalIdBrand: unique symbol = Symbol("TurnStateCanonicalId");

export type TurnStateCanonicalId = string & {
  readonly [TurnStateCanonicalIdBrand]: true;
};

/**
 * Builds the canonical id for a turn-state contribution (`featureId`).
 * Validates the feature id against the shared token grammar; a failure is
 * an app bug.
 */
function toTurnStateCanonicalId(featureId: string): TurnStateCanonicalId {
  assertStateToken("feature id", featureId);
  return featureId as TurnStateCanonicalId;
}

function assertStateToken(label: string, token: string): void {
  const pattern = /^[a-z][a-z0-9_-]*$/;
  if (!pattern.test(token)) {
    throw new Error(`Invalid ${label}: ${token}. Expected ${pattern}.`);
  }
}

export interface TurnStatePreparationContext {
  cwd: string;
  branch: readonly SessionEntry[];
}

export interface PreparedTurnState {
  state: unknown;
}

/**
 * A turn-state contribution from a feature. Exactly one per feature.
 * Preparation callbacks are optional — a contribution that declares neither
 * is valid but inert.
 */
export interface TurnStateContribution {
  prepareUserSubmitState?: (
    ctx: TurnStatePreparationContext,
  ) => MaybePromise<PreparedTurnState | undefined>;
  prepareAgentEndState?: (
    ctx: TurnStatePreparationContext,
  ) => MaybePromise<PreparedTurnState | undefined>;
}

interface RegisteredTurnStateContribution extends TurnStateContribution {
  readonly contributionId: ContributionId;
  readonly canonicalId: TurnStateCanonicalId;
}

/** Registry for turn-state contributions. Features pass this to `registerTurnStateContributions`; they never register directly. */
export class TurnStateRegistry {
  readonly registeredContributions: RegisteredTurnStateContribution[] = [];
}

/** The sole registration path for turn-state contributions. Derives both ids, enforces the singleton-per-feature invariant, and returns a Disposable. */
export function registerTurnStateContributions(
  registry: TurnStateRegistry,
  featureId: string,
  contributions: readonly TurnStateContribution[],
): Disposable {
  if (contributions.length > 1) {
    throw new Error(
      `Feature ${featureId} contributes more than one turn-state contribution. This is a singleton facet: at most one per feature.`,
    );
  }

  if (contributions.length === 0) return new DisposableBag();

  const contribution = contributions[0];
  const canonicalId = toTurnStateCanonicalId(featureId);
  const contributionId = toContributionId(featureId, "turn-state");

  if (
    registry.registeredContributions.some((e) => e.canonicalId === canonicalId)
  ) {
    throw new Error(`Turn state already registered: ${canonicalId as string}`);
  }

  const registered: RegisteredTurnStateContribution = {
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

export function createTurnStateCoordinator(
  state: TurnStateRegistry,
): AgentInstaller {
  return (pi) => {
    const installedContributions = [...state.registeredContributions];

    pi.on("input", async (_event, ctx) => {
      await appendPreparedTurnState(pi, {
        cwd: ctx.cwd,
        branch: ctx.sessionManager.getBranch(),
        contributions: filterInLiveContributions(state, installedContributions),
        select: (contribution) => contribution.prepareUserSubmitState,
      });
    });

    pi.on("agent_end", async (_event, ctx) => {
      await appendPreparedTurnState(pi, {
        cwd: ctx.cwd,
        branch: ctx.sessionManager.getBranch(),
        contributions: filterInLiveContributions(state, installedContributions),
        select: (contribution) => contribution.prepareAgentEndState,
      });
    });
  };
}

function filterInLiveContributions(
  state: TurnStateRegistry,
  installedContributions: readonly RegisteredTurnStateContribution[],
): readonly RegisteredTurnStateContribution[] {
  return installedContributions.filter((contribution) =>
    state.registeredContributions.includes(contribution),
  );
}

async function appendPreparedTurnState(
  pi: ExtensionAPI,
  opts: {
    cwd: string;
    branch: readonly SessionEntry[];
    contributions: readonly RegisteredTurnStateContribution[];
    select: (
      contribution: RegisteredTurnStateContribution,
    ) => RegisteredTurnStateContribution["prepareUserSubmitState"];
  },
): Promise<void> {
  const preparedState: Record<string, unknown> = {};

  for (const contribution of opts.contributions) {
    const prepare = opts.select(contribution);
    if (!prepare) continue;

    const prepared = await prepare({ cwd: opts.cwd, branch: opts.branch });
    if (!prepared) continue;
    preparedState[contribution.canonicalId] = prepared.state;
  }

  if (Object.keys(preparedState).length === 0) return;
  pi.appendEntry(TurnStateEntryType, { state: preparedState, cwd: opts.cwd });
}
