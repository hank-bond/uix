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
  SessionEntry,
  SessionManager,
} from "@earendil-works/pi-coding-agent";

import { toContributionId, type ContributionId } from "#shared/contribution-id";
import { createLogger } from "../log";
import { DisposableBag } from "../lifecycle";
import type { AgentInstaller } from "../agent/installers";

const log = createLogger("turn-state");

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

export interface TurnStateHistoryEntry<TState = unknown> {
  readonly entryId: string;
  readonly cwd: string | undefined;
  readonly state: TState;
}

export interface TurnStateHistoryOptions {
  readonly offset?: number;
  readonly limit?: number;
}

// Access to committed turn-state history for one feature key. The nearest
// entry is whatever is latest at the point this reader is used: in turn-state
// prep that means the previous committed state; after prep appends, it means
// the just-committed state.  Keep this in mind because it does mean you have
// to be aware of the order of facet execution sometimes.  The expectaion is
// that you will not implement this directly, but will extend or alias it with
// the name of your execution stage.
export interface TurnStateHistoryReader {
  turnState<TState = unknown>(): TurnStateHistoryEntry<TState> | undefined;
  turnStates<TState = unknown>(
    opts?: TurnStateHistoryOptions,
  ): readonly TurnStateHistoryEntry<TState>[];
}

// Turn-state prep adds cwd to the same feature-bound history reader. Again,
// in turn-state prep stage, the most recent state is going to be the committed
// state from the previous turn, not this turn (since that has not been committed
// yet, hence us being in prep :D )
export interface TurnStatePreparationContext extends TurnStateHistoryReader {
  cwd: string;
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

/**
 * Create the agent_end hook for turn-state prep. The submit-side prep
 * is called directly by the driver (see submitTurnStatePrep) so uix.turn-state
 * entries are ordered before the user message in the session tree.
 */
export function createTurnStateCoordinator(
  state: TurnStateRegistry,
): AgentInstaller {
  return (pi) => {
    const installedContributions = [...state.registeredContributions];

    pi.on("agent_end", async (_event, ctx) => {
      await appendPreparedTurnState({
        sessionManager: ctx.sessionManager,
        cwd: ctx.cwd,
        branch: ctx.sessionManager.getBranch(),
        contributions: filterInLiveContributions(state, installedContributions),
        select: (contribution) => contribution.prepareAgentEndState,
      });
    });
  };
}

/**
 * Run submit-side turn-state prep. Called by the driver before
 * session.prompt(text) so turn-state entries are ordered before the user
 * message in the session tree.
 */
export async function submitTurnStatePrep(
  sessionManager: SessionManager,
  cwd: string,
  registry: TurnStateRegistry,
): Promise<void> {
  await appendPreparedTurnState({
    sessionManager,
    cwd,
    branch: sessionManager.getBranch(),
    contributions: registry.registeredContributions,
    select: (contribution) => contribution.prepareUserSubmitState,
  });
}

function filterInLiveContributions(
  state: TurnStateRegistry,
  installedContributions: readonly RegisteredTurnStateContribution[],
): readonly RegisteredTurnStateContribution[] {
  return installedContributions.filter((contribution) =>
    state.registeredContributions.includes(contribution),
  );
}

async function appendPreparedTurnState(opts: {
  sessionManager: SessionManager;
  cwd: string;
  branch: readonly SessionEntry[];
  contributions: readonly RegisteredTurnStateContribution[];
  select: (
    contribution: RegisteredTurnStateContribution,
  ) => RegisteredTurnStateContribution["prepareUserSubmitState"];
}): Promise<void> {
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

  if (Object.keys(preparedState).length === 0) {
    log.debug("no_state_produced");
    return;
  }
  log.debug(
    { sections: Object.keys(preparedState).length, preparedState },
    "committed",
  );
  opts.sessionManager.appendCustomEntry(TurnStateEntryType, {
    state: preparedState,
    cwd: opts.cwd,
  });
}

export function createTurnStateHistoryReader(
  branch: readonly SessionEntry[],
  featureId: string,
): TurnStateHistoryReader {
  const canonicalId = toTurnStateCanonicalId(featureId);
  return {
    turnState<TState = unknown>() {
      return turnStates<TState>(branch, canonicalId, { limit: 1 })[0];
    },
    turnStates<TState = unknown>(historyOpts = {}) {
      return turnStates<TState>(branch, canonicalId, historyOpts);
    },
  };
}

function createTurnStatePreparationContext(opts: {
  cwd: string;
  branch: readonly SessionEntry[];
  canonicalId: TurnStateCanonicalId;
}): TurnStatePreparationContext {
  return {
    cwd: opts.cwd,
    turnState<TState = unknown>() {
      return turnStates<TState>(opts.branch, opts.canonicalId, { limit: 1 })[0];
    },
    turnStates<TState = unknown>(historyOpts = {}) {
      return turnStates<TState>(opts.branch, opts.canonicalId, historyOpts);
    },
  };
}

// Walk the current root→leaf path from leaf to root and return only the
// turn-state entries that contain this feature's key. Offset and limit apply
// to matching states, not raw session entries.
function turnStates<TState>(
  branch: readonly SessionEntry[],
  canonicalId: TurnStateCanonicalId,
  opts: TurnStateHistoryOptions,
): TurnStateHistoryEntry<TState>[] {
  const offset = opts.offset ?? 0;
  const limit = opts.limit ?? branch.length;
  assertNonNegativeInteger("turn-state history offset", offset);
  assertNonNegativeInteger("turn-state history limit", limit);

  const result: TurnStateHistoryEntry<TState>[] = [];
  let skipped = 0;
  for (let index = branch.length - 1; index >= 0; index -= 1) {
    const turnState = extractTurnStateEntry(branch[index], canonicalId);
    if (!turnState) continue;

    if (skipped < offset) {
      skipped += 1;
      continue;
    }

    result.push(turnState as TurnStateHistoryEntry<TState>);
    if (result.length >= limit) break;
  }
  return result;
}

function extractTurnStateEntry(
  entry: SessionEntry,
  canonicalId: TurnStateCanonicalId,
): TurnStateHistoryEntry | undefined {
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
