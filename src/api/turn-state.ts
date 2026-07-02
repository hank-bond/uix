// turn-state contribution type.
//
// Features contribute optional state-preparation hooks that run at UIX turn
// boundaries. The substrate records prepared state as durable refs under a
// substrate-owned session entry; features read back prior state through the
// TurnStateHistoryReader passed to AgentContextContribution materializers.

type MaybePromise<T> = T | Promise<T>;

export interface TurnStateHistoryEntry<TState = unknown> {
  readonly entryId: string;
  readonly cwd: string | undefined;
  readonly state: TState;
}

export interface TurnStateHistoryOptions {
  readonly offset?: number;
  readonly limit?: number;
}

/**
 * Read-only access to committed turn-state history for one feature key.
 * The nearest entry is whatever is latest at the point this reader is used.
 */
export interface TurnStateHistoryReader {
  turnState<TState = unknown>(): TurnStateHistoryEntry<TState> | undefined;
  turnStates<TState = unknown>(
    opts?: TurnStateHistoryOptions,
  ): readonly TurnStateHistoryEntry<TState>[];
}

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
