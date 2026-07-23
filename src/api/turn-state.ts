// turn-state contribution types.
//
// A feature divides its durable branch state into independently changing named
// cells. Each cell declares one schema for snapshot creation and restoration,
// while the substrate derives its persisted identity from the owning feature
// and cell name.

import type { Static, TSchema } from "typebox";

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

/** Read-only access to one owning feature's committed cell histories. */
export interface TurnStateHistoryReader {
  turnState<TState = unknown>(
    cellName: string,
  ): TurnStateHistoryEntry<TState> | undefined;
  turnStates<TState = unknown>(
    cellName: string,
    opts?: TurnStateHistoryOptions,
  ): readonly TurnStateHistoryEntry<TState>[];
}

export interface TurnStateCellDefinition<Schema extends TSchema = TSchema> {
  readonly schema: Schema;
  /** Creates this cell's complete current JSON snapshot for a durable commit. */
  readonly createSnapshot: () => MaybePromise<Static<Schema>>;
  /** Replaces live state from the selected branch; undefined means defaults. */
  readonly restore: (state: Static<Schema> | undefined) => MaybePromise<void>;
}

export type TurnStateContributions = Readonly<
  Record<string, TurnStateCellDefinition>
>;

/** Carries one cell's TypeBox schema into snapshot creation and restoration. */
export function defineTurnStateCell<const Schema extends TSchema>(
  definition: TurnStateCellDefinition<Schema>,
): TurnStateCellDefinition<Schema> {
  return definition;
}
