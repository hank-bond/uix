// private state lifecycle registry.
//
// State cells create snapshots that the coordinator commits as cockpit-private
// session entries at durable run boundaries. Unlike model-visible agent context,
// this pathway records branch state the substrate needs to restore later.

import type {
  SessionEntry,
  SessionManager,
} from "@earendil-works/pi-coding-agent";
import { IsCodec, Type, type TSchema } from "typebox";
import { Value } from "typebox/value";

import {
  toContributionId,
  type ContributionId,
} from "@uix/api/contribution-id";
import type {
  TurnStateCellDefinition,
  TurnStateContributions,
  TurnStateHistoryEntry,
  TurnStateHistoryOptions,
  TurnStateHistoryReader,
} from "@uix/api/turn-state";
import type { AgentInstaller } from "../agent/installers";
import { createLogger } from "../log";

const log = createLogger("turn-state");

const TurnStateEntryType = "uix.turn-state";
const stateTokenPattern = /^[a-z][a-z0-9_-]*$/;

const TurnStateCanonicalIdBrand: unique symbol = Symbol("TurnStateCanonicalId");

type TurnStateCanonicalId = string & {
  readonly [TurnStateCanonicalIdBrand]: true;
};

interface RegisteredTurnStateCell {
  readonly featureId: string;
  readonly cellName: string;
  readonly contributionId: ContributionId;
  readonly canonicalId: TurnStateCanonicalId;
  readonly schema: TSchema;
  readonly createSnapshot: TurnStateCellDefinition["createSnapshot"];
  readonly restore: TurnStateCellDefinition["restore"];
}

/** Registry for independently committed feature state cells. */
export class TurnStateRegistry {
  readonly registeredCells: RegisteredTurnStateCell[] = [];
}

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

export function createTurnStateProjector(
  registry?: TurnStateRegistry,
): TurnStateProjector {
  return createTurnStateProjectorForIds(
    new Set(registry?.registeredCells.map((cell) => cell.canonicalId) ?? []),
  );
}

export async function restoreTurnStateCellsAsOfLeaf(
  registry: TurnStateRegistry,
  turnState: TurnStateAsOfLeaf,
): Promise<TurnStateRestoreResult> {
  const cellsPerFeature = new Map<string, RegisteredTurnStateCell[]>();
  for (const cell of registry.registeredCells) {
    const cells = cellsPerFeature.get(cell.featureId) ?? [];
    cells.push(cell);
    cellsPerFeature.set(cell.featureId, cells);
  }

  const validationFailurePerFeature = new Map<
    string,
    TurnStateRestoreFailure
  >();
  for (const cell of registry.registeredCells) {
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
            { feature: featureId, cell: cell.cellName, err: error.message },
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

/** Registers one feature's keyed state cells as one disposable group. */
export function registerTurnStateContributions(
  registry: TurnStateRegistry,
  featureId: string,
  contributions: TurnStateContributions,
): Disposable {
  const registered = Object.entries(contributions).map(
    ([cellName, contribution]): RegisteredTurnStateCell => {
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
      if (
        registry.registeredCells.some(
          (existing) => existing.canonicalId === canonicalId,
        )
      ) {
        throw new Error(`Turn state already registered: ${canonicalId}`);
      }
      return {
        ...contribution,
        featureId,
        cellName,
        contributionId: toContributionId(featureId, "turn-state", cellName),
        canonicalId,
      };
    },
  );

  registry.registeredCells.push(...registered);

  return {
    [Symbol.dispose]: (): void => {
      for (const cell of registered) {
        const index = registry.registeredCells.indexOf(cell);
        if (index !== -1) registry.registeredCells.splice(index, 1);
      }
    },
  };
}

/** Installs agent-end turn-state commits for the current Pi runtime generation. */
export function createTurnStateCoordinator(
  state: TurnStateRegistry,
): AgentInstaller {
  return (pi) => {
    const installedCells = [...state.registeredCells];

    pi.on("agent_end", async (_event, ctx) => {
      await commitTurnState({
        append: (customType, data) => pi.appendEntry(customType, data),
        cwd: ctx.cwd,
        branch: ctx.sessionManager.getBranch(),
        cells: installedCells.filter((cell) =>
          state.registeredCells.includes(cell),
        ),
      });
    });
  };
}

/** Commits live turn state at a durable session boundary. */
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
    cells: registry.registeredCells,
  });
}

interface CommitTurnStateOptions {
  append: (customType: string, data: unknown) => void;
  cwd: string;
  branch: readonly SessionEntry[];
  cells: readonly RegisteredTurnStateCell[];
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
    log.debug("no_state_changed");
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
): TurnStateProjector {
  const latestValuePerCell = new Map<TurnStateCanonicalId, unknown>();
  let cwd: string | undefined;

  return {
    projectEntry(entry) {
      const data = extractTurnStateData(entry);
      if (!data) return;
      if (typeof data["cwd"] === "string") cwd = data["cwd"];
      const state = asRecord(data["state"]);
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
): TurnStateHistoryEntry<TState>[] {
  const offset = opts.offset ?? 0;
  const limit = opts.limit ?? branch.length;
  assertNonNegativeInteger("turn-state history offset", offset);
  assertNonNegativeInteger("turn-state history limit", limit);

  const result: TurnStateHistoryEntry<TState>[] = [];
  let skipped = 0;
  for (let index = branch.length - 1; index >= 0; index -= 1) {
    const state = extractTurnStateRecord(branch[index]);
    if (!state || !(canonicalId in state)) continue;

    if (skipped < offset) {
      skipped += 1;
      continue;
    }

    const entry = branch[index];
    const data = asRecord(entry.type === "custom" ? entry.data : undefined);
    result.push({
      entryId: entry.id,
      cwd: typeof data?.["cwd"] === "string" ? data["cwd"] : undefined,
      state: state[canonicalId] as TState,
    });
    if (result.length >= limit) break;
  }
  return result;
}

function extractTurnStateRecord(
  entry: SessionEntry,
): Record<string, unknown> | undefined {
  return asRecord(extractTurnStateData(entry)?.["state"]);
}

function extractTurnStateData(
  entry: SessionEntry,
): Record<string, unknown> | undefined {
  if (entry.type !== "custom" || entry.customType !== TurnStateEntryType) {
    return undefined;
  }
  return asRecord(entry.data);
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
      `Invalid ${label}: ${token}. Expected ${stateTokenPattern}.`,
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

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
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
