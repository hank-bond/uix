// Commits and restores each feature's private branch state in Pi sessions without showing it to the model.
//
// State cells become host-private Pi session entries at durable run boundaries.
// Registry snapshots preserve exact cell identity so deferred restoration can
// reject feature instances replaced by reload.

import type {
  SessionEntry,
  SessionManager,
} from "@earendil-works/pi-coding-agent";
import { IsCodec, type Static, type TSchema, Type } from "typebox";
import { Value } from "typebox/value";

import {
  type ContributionId,
  toContributionId,
} from "@uix/api/contribution-id";
import type {
  TurnStateCellDefinition,
  TurnStateContributions,
  TurnStateHistoryEntry,
  TurnStateHistoryOptions,
  TurnStateHistoryReader,
} from "@uix/api/turn-state";

import type { AgentInstaller } from "./agent/installers";
import { createLogger } from "./log";

const log = createLogger("turn-state");

const TurnStateEntryType = "uix.turn-state";
const TurnStateEntryDataSchema = Type.Partial(
  Type.Object({
    cwd: Type.String(),
    state: Type.Record(Type.String(), Type.Unknown()),
  }),
);
type TurnStateEntryData = Static<typeof TurnStateEntryDataSchema>;

const stateTokenPattern = /^[a-z][a-z0-9_-]*$/;

const TurnStateCanonicalIdBrand: unique symbol = Symbol("TurnStateCanonicalId");

type TurnStateCanonicalId = string & {
  readonly [TurnStateCanonicalIdBrand]: true;
};

const TurnStateRegistrySnapshotBrand: unique symbol = Symbol(
  "TurnStateRegistrySnapshot",
);

export interface ResolvedTurnStateCellContribution {
  readonly featureId: string;
  readonly cellName: string;
  readonly contributionId: ContributionId;
  readonly canonicalId: TurnStateCanonicalId;
  readonly schema: TSchema;
  readonly createSnapshot: TurnStateCellDefinition["createSnapshot"];
  readonly restore: TurnStateCellDefinition["restore"];
}

/** Own live, independently committed feature state cells in registration order. */
// Section: Registry
export class TurnStateRegistry {
  readonly #registeredCells: ResolvedTurnStateCellContribution[] = [];

  register(
    resolvedContributions: readonly ResolvedTurnStateCellContribution[],
  ): Disposable {
    const canonicalIds = new Set(
      this.#registeredCells.map((cell) => cell.canonicalId),
    );
    for (const cell of resolvedContributions) {
      if (canonicalIds.has(cell.canonicalId)) {
        throw new Error(`Turn state already registered: ${cell.canonicalId}`);
      }
      canonicalIds.add(cell.canonicalId);
    }

    const added = [...resolvedContributions];
    this.#registeredCells.push(...added);
    return {
      [Symbol.dispose]: (): void => {
        for (const cell of added) {
          const index = this.#registeredCells.indexOf(cell);
          if (index !== -1) this.#registeredCells.splice(index, 1);
        }
      },
    };
  }

  list(): readonly ResolvedTurnStateCellContribution[] {
    return [...this.#registeredCells];
  }

  has(cell: ResolvedTurnStateCellContribution): boolean {
    return this.#registeredCells.includes(cell);
  }
}

/**
 * An immutable, transient view of the registry's exact live cells. Cell
 * identity lets a deferred startup restore recognize that reload replaced its
 * feature instances without snapshotting their working state.
 */
export interface TurnStateRegistrySnapshot {
  readonly [TurnStateRegistrySnapshotBrand]: true;
  readonly cells: readonly ResolvedTurnStateCellContribution[];
}

export function toTurnStateRegistrySnapshot(
  registry: TurnStateRegistry,
): TurnStateRegistrySnapshot {
  return {
    [TurnStateRegistrySnapshotBrand]: true,
    cells: registry.list(),
  };
}

export function isSameTurnStateRegistrySnapshot(
  left: TurnStateRegistrySnapshot,
  right: TurnStateRegistrySnapshot,
): boolean {
  return (
    left.cells.length === right.cells.length &&
    left.cells.every((cell, index) => cell === right.cells[index])
  );
}

export function isTurnStateRegistrySnapshotCurrent(
  registry: TurnStateRegistry,
  snapshot: TurnStateRegistrySnapshot,
): boolean {
  const registeredCells = registry.list();
  return (
    registeredCells.length === snapshot.cells.length &&
    registeredCells.every((cell, index) => cell === snapshot.cells[index])
  );
}

// Section: Projection
export interface TurnStateAsOfLeaf {
  readonly latestValuePerCell: ReadonlyMap<TurnStateCanonicalId, unknown>;
  readonly cwd: string | undefined;
}

export interface TurnStateRestoreFailure {
  readonly featureId: string;
  readonly cellName: string;
  readonly phase: "validation" | "restore";
  readonly error: Error;
}

export interface TurnStateRestoreResult {
  readonly failures: readonly TurnStateRestoreFailure[];
}

interface TurnStateProjector {
  projectEntry(entry: SessionEntry): void;
  deriveAsOfLeaf(): TurnStateAsOfLeaf;
}

/** Project the latest active cell values and cwd from branch entries. */
export function createTurnStateProjector(
  registrySnapshot?: TurnStateRegistrySnapshot,
  initialCwd?: string,
): TurnStateProjector {
  return createTurnStateProjectorForIds(
    new Set(registrySnapshot?.cells.map((cell) => cell.canonicalId) ?? []),
    initialCwd,
  );
}

/**
 * Restore one registry generation from projected branch state.
 *
 * Validation is atomic per feature. Features restore concurrently, while each
 * feature's cells restore sequentially and stop after their first failure.
 */
export async function restoreTurnStateCellsAsOfLeaf(
  registrySnapshot: TurnStateRegistrySnapshot,
  turnState: TurnStateAsOfLeaf,
): Promise<TurnStateRestoreResult> {
  const cellsPerFeature = new Map<
    string,
    ResolvedTurnStateCellContribution[]
  >();
  for (const cell of registrySnapshot.cells) {
    const cells = cellsPerFeature.get(cell.featureId) ?? [];
    cells.push(cell);
    cellsPerFeature.set(cell.featureId, cells);
  }

  const validationFailurePerFeature = new Map<
    string,
    TurnStateRestoreFailure
  >();
  for (const cell of registrySnapshot.cells) {
    if (!turnState.latestValuePerCell.has(cell.canonicalId)) continue;
    const value = turnState.latestValuePerCell.get(cell.canonicalId);
    if (Value.Check(cell.schema, value)) continue;

    const failure: TurnStateRestoreFailure = {
      featureId: cell.featureId,
      cellName: cell.cellName,
      phase: "validation",
      error: new Error(
        `Invalid persisted turn-state value for ${cell.canonicalId}: value does not match its schema`,
      ),
    };
    if (!validationFailurePerFeature.has(cell.featureId)) {
      validationFailurePerFeature.set(cell.featureId, failure);
      log.error(
        {
          feature: failure.featureId,
          cell: failure.cellName,
          err: failure.error.message,
        },
        "restore_validation_failed",
      );
    }
  }

  const failures = await Promise.all(
    [...cellsPerFeature].map(async ([featureId, cells]) => {
      const validationFailure = validationFailurePerFeature.get(featureId);
      if (validationFailure) return validationFailure;

      for (const cell of cells) {
        const value = turnState.latestValuePerCell.get(cell.canonicalId);
        try {
          await cell.restore(value);
        } catch (thrown) {
          const error =
            thrown instanceof Error ? thrown : new Error(String(thrown));
          const failure: TurnStateRestoreFailure = {
            featureId,
            cellName: cell.cellName,
            phase: "restore",
            error,
          };
          log.error(
            {
              feature: featureId,
              cell: cell.cellName,
              err: error.message,
            },
            "restore_callback_failed",
          );
          return failure;
        }
      }
      return undefined;
    }),
  );

  return {
    failures: failures.filter(
      (failure): failure is TurnStateRestoreFailure => failure !== undefined,
    ),
  };
}

/** Resolve and validate one feature's cell definitions without registering them. */
// Section: Resolution and registration
export function resolveTurnStateContributions(
  featureId: string,
  contributions: TurnStateContributions,
): readonly ResolvedTurnStateCellContribution[] {
  return Object.entries(contributions).map(([cellName, contribution]) => {
    const canonicalId = toTurnStateCanonicalId(featureId, cellName);
    if (!Type.IsSchema(contribution.schema)) {
      throw new Error(`Invalid turn-state schema: ${canonicalId}`);
    }
    if (containsTypeBoxCodec(contribution.schema)) {
      throw new Error(
        `Invalid turn-state schema for ${canonicalId}: codecs are not supported`,
      );
    }
    if (typeof contribution.createSnapshot !== "function") {
      throw new Error(`Invalid turn-state snapshot factory: ${canonicalId}`);
    }
    if (typeof contribution.restore !== "function") {
      throw new Error(`Invalid turn-state restore callback: ${canonicalId}`);
    }
    return {
      ...contribution,
      featureId,
      cellName,
      contributionId: toContributionId(featureId, "turn-state", cellName),
      canonicalId,
    };
  });
}

/** Resolves and registers one feature's keyed state cells. */
export function registerTurnStateContributions(
  registry: TurnStateRegistry,
  featureId: string,
  contributions: TurnStateContributions,
): Disposable {
  return registry.register(
    resolveTurnStateContributions(featureId, contributions),
  );
}

/** Installs agent-end turn-state commits for the current Pi runtime generation. */
export function createTurnStateInstaller(
  registry: TurnStateRegistry,
): AgentInstaller {
  return (pi) => {
    const runtimeCells = registry.list();

    pi.on("agent_end", async (_event, ctx) => {
      await commitTurnState({
        append: (customType, data) => {
          pi.appendEntry(customType, data);
        },
        cwd: ctx.cwd,
        branch: ctx.sessionManager.getBranch(),
        cells: runtimeCells.filter((cell) => registry.has(cell)),
      });
    });
  };
}

/** Commits live turn state at a durable session boundary. */
// Section: Commit
export async function commitCurrentTurnState(
  sessionManager: SessionManager,
  cwd: string,
  registry: TurnStateRegistry,
): Promise<void> {
  await commitTurnState({
    append: (customType, data) =>
      void sessionManager.appendCustomEntry(customType, data),
    cwd,
    branch: sessionManager.getBranch(),
    cells: registry.list(),
  });
}

interface CommitTurnStateOptions {
  append: (customType: string, data: unknown) => void;
  cwd: string;
  branch: readonly SessionEntry[];
  cells: readonly ResolvedTurnStateCellContribution[];
}

async function commitTurnState(opts: CommitTurnStateOptions): Promise<void> {
  const baseline = deriveTurnStateBaseline(
    opts.branch,
    new Set(opts.cells.map((cell) => cell.canonicalId)),
  );
  const changedState: Record<string, unknown> = {};

  for (const cell of opts.cells) {
    const snapshot = toPlainJson(await cell.createSnapshot(), cell.canonicalId);
    if (!Value.Check(cell.schema, snapshot)) {
      throw new Error(
        `Invalid turn-state snapshot for ${cell.canonicalId}: value does not match its schema`,
      );
    }
    if (
      baseline.latestValuePerCell.has(cell.canonicalId) &&
      Value.Equal(baseline.latestValuePerCell.get(cell.canonicalId), snapshot)
    ) {
      continue;
    }
    changedState[cell.canonicalId] = snapshot;
  }

  const changedCellCount = Object.keys(changedState).length;
  if (changedCellCount === 0 && baseline.cwd === opts.cwd) {
    log.debug({}, "no_state_changed");
    return;
  }
  log.debug(
    {
      cells: changedCellCount,
      state: changedState,
      cwdChanged: baseline.cwd !== opts.cwd,
    },
    "committed",
  );
  opts.append(TurnStateEntryType, {
    state: changedState,
    cwd: opts.cwd,
  });
}

/** Creates a history reader that can address only the owning feature's cells. */
// Section: History reader
export function createTurnStateHistoryReader(
  branch: readonly SessionEntry[],
  featureId: string,
): TurnStateHistoryReader {
  return {
    turnState<TState = unknown>(cellName: string) {
      const canonicalId = toTurnStateCanonicalId(featureId, cellName);
      return turnStates<TState>(branch, canonicalId, { limit: 1 })[0];
    },
    turnStates<TState = unknown>(
      cellName: string,
      historyOpts: TurnStateHistoryOptions = {},
    ) {
      return turnStates<TState>(
        branch,
        toTurnStateCanonicalId(featureId, cellName),
        historyOpts,
      );
    },
  };
}

function deriveTurnStateBaseline(
  branch: readonly SessionEntry[],
  activeIds: ReadonlySet<TurnStateCanonicalId>,
): TurnStateAsOfLeaf {
  const projector = createTurnStateProjectorForIds(activeIds);
  for (const entry of branch) projector.projectEntry(entry);
  return projector.deriveAsOfLeaf();
}

function createTurnStateProjectorForIds(
  activeIds: ReadonlySet<TurnStateCanonicalId>,
  initialCwd?: string,
): TurnStateProjector {
  const latestValuePerCell = new Map<TurnStateCanonicalId, unknown>();
  let cwd = initialCwd;

  return {
    projectEntry(entry) {
      const data = asTurnStateEntryData(entry);
      if (!data) return;
      cwd = data.cwd ?? cwd;
      const { state } = data;
      if (!state) return;
      for (const [id, value] of Object.entries(state)) {
        const canonicalId = id as TurnStateCanonicalId;
        if (activeIds.has(canonicalId)) {
          latestValuePerCell.set(canonicalId, value);
        }
      }
    },

    deriveAsOfLeaf: () => ({
      latestValuePerCell: new Map(latestValuePerCell),
      cwd,
    }),
  };
}

function turnStates<TState>(
  branch: readonly SessionEntry[],
  canonicalId: TurnStateCanonicalId,
  opts: TurnStateHistoryOptions,
): Array<TurnStateHistoryEntry<TState>> {
  const offset = opts.offset ?? 0;
  const limit = opts.limit ?? branch.length;
  assertNonNegativeInteger("turn-state history offset", offset);
  assertNonNegativeInteger("turn-state history limit", limit);

  const result: Array<TurnStateHistoryEntry<TState>> = [];
  let skipped = 0;
  for (let index = branch.length - 1; index >= 0; index -= 1) {
    const data = asTurnStateEntryData(branch[index]);
    const state = data?.state;
    if (!state || !(canonicalId in state)) continue;

    if (skipped < offset) {
      skipped += 1;
      continue;
    }

    const entry = branch[index];
    result.push({
      entryId: entry.id,
      cwd: data.cwd,
      state: state[canonicalId] as TState,
    });
    if (result.length >= limit) break;
  }
  return result;
}

// Section: Entry data helpers
export function asTurnStateEntryData(
  entry: SessionEntry,
): TurnStateEntryData | undefined {
  if (entry.type !== "custom" || entry.customType !== TurnStateEntryType) {
    return undefined;
  }
  return Value.Check(TurnStateEntryDataSchema, entry.data)
    ? entry.data
    : undefined;
}

function toTurnStateCanonicalId(
  featureId: string,
  cellName: string,
): TurnStateCanonicalId {
  assertStateToken("feature id", featureId);
  assertStateToken("turn-state cell name", cellName);
  return `${featureId}.${cellName}` as TurnStateCanonicalId;
}

function assertStateToken(label: string, token: string): void {
  if (!stateTokenPattern.test(token)) {
    throw new Error(
      `Invalid ${label}: ${token}. Expected ${String(stateTokenPattern)}.`,
    );
  }
}

function containsTypeBoxCodec(
  value: unknown,
  visited = new Set<object>(),
): boolean {
  if (IsCodec(value)) return true;
  if (typeof value !== "object" || value === null || visited.has(value)) {
    return false;
  }
  visited.add(value);
  return Object.values(value).some((item) =>
    containsTypeBoxCodec(item, visited),
  );
}

function toPlainJson(value: unknown, canonicalId: string): unknown {
  assertPlainJson(value, canonicalId);
  return JSON.parse(JSON.stringify(value)) as unknown;
}

function assertPlainJson(value: unknown, canonicalId: string): void {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean" ||
    (typeof value === "number" && Number.isFinite(value))
  ) {
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) assertPlainJson(item, canonicalId);
    return;
  }
  if (typeof value === "object") {
    const prototype = Object.getPrototypeOf(value) as object | null;
    if (prototype !== Object.prototype && prototype !== null) {
      throw new Error(
        `Invalid turn-state snapshot for ${canonicalId}: value must be plain JSON`,
      );
    }
    for (const item of Object.values(value)) {
      assertPlainJson(item, canonicalId);
    }
    return;
  }
  throw new Error(
    `Invalid turn-state snapshot for ${canonicalId}: value must be plain JSON`,
  );
}

function assertNonNegativeInteger(label: string, value: number): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(
      `Invalid ${label}: ${String(value)}. Expected a non-negative integer.`,
    );
  }
}
