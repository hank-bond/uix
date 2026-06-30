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

export interface PreviousTurnState<TState = unknown> {
  readonly entryId: string;
  readonly cwd: string | undefined;
  readonly state: TState;
}

export interface PreviousTurnStatesOptions {
  readonly offset?: number;
  readonly limit?: number;
}

export interface TurnStatePreparationContext {
  cwd: string;
  previousTurnState<TState = unknown>(): PreviousTurnState<TState> | undefined;
  previousTurnStates<TState = unknown>(
    opts?: PreviousTurnStatesOptions,
  ): readonly PreviousTurnState<TState>[];
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

    const prepared = await prepare(
      createTurnStatePreparationContext({
        cwd: opts.cwd,
        branch: opts.branch,
        canonicalId: contribution.canonicalId,
      }),
    );
    if (!prepared) continue;
    preparedState[contribution.canonicalId] = prepared.state;
  }

  if (Object.keys(preparedState).length === 0) return;
  pi.appendEntry(TurnStateEntryType, { state: preparedState, cwd: opts.cwd });
}

// We bind the methods so that they can only access the same key that
// is being provided in the contribution.
function createTurnStatePreparationContext(opts: {
  cwd: string;
  branch: readonly SessionEntry[];
  canonicalId: TurnStateCanonicalId;
}): TurnStatePreparationContext {
  return {
    cwd: opts.cwd,
    previousTurnState<TState = unknown>() {
      return previousTurnStates<TState>(opts.branch, opts.canonicalId, {
        limit: 1,
      })[0];
    },
    previousTurnStates<TState = unknown>(historyOpts = {}) {
      return previousTurnStates<TState>(
        opts.branch,
        opts.canonicalId,
        historyOpts,
      );
    },
  };
}

/* Iterate through the TurnState customEntry blocks in the session 
history such that we select the first N nodes that are both parents
of the current leaf we are at and contain the target key within 
our TurnState.  We skip all other nodes.
*/
function previousTurnStates<TState>(
  branch: readonly SessionEntry[],
  canonicalId: TurnStateCanonicalId,
  opts: PreviousTurnStatesOptions,
): PreviousTurnState<TState>[] {
  const offset = opts.offset ?? 0;
  const limit = opts.limit ?? branch.length;
  assertNonNegativeInteger("previous turn-state offset", offset);
  assertNonNegativeInteger("previous turn-state limit", limit);

  const result: PreviousTurnState<TState>[] = [];
  let skipped = 0;
  for (let index = branch.length - 1; index >= 0; index -= 1) {
    const turnState = extractTurnStateEntry(branch[index], canonicalId);
    if (!turnState) continue;

    if (skipped < offset) {
      skipped += 1;
      continue;
    }

    result.push(turnState as PreviousTurnState<TState>);
    if (result.length >= limit) break;
  }
  return result;
}

function extractTurnStateEntry(
  entry: SessionEntry,
  canonicalId: TurnStateCanonicalId,
): PreviousTurnState | undefined {
  if (entry.type !== "custom") return undefined;
  if (entry.customType !== TurnStateEntryType) return undefined;
  const data = asRecord(entry.data);
  const state = asRecord(data?.["state"]);
  if (!state) return undefined;
  if (!(canonicalId in state)) return undefined;
  return {
    entryId: entry.id,
    cwd: typeof data?.["cwd"] === "string" ? data["cwd"] : undefined,
    state: state[canonicalId],
  };
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : undefined;
}

function assertNonNegativeInteger(label: string, value: number): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(
      `Invalid ${label}: ${value}. Expected a non-negative integer.`,
    );
  }
}
