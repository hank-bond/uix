// Persistence owner for `uix.workspace.json`.
//
// The store keeps one active manifest generation and stages disk reads as
// separate mutable generations. Callers validate and hydrate a staged
// generation before promoting it; rejection leaves the active generation and
// its pending flush untouched. Purpose-built location handles keep tree shape
// knowledge here and remain bound to the generation that minted them.

import { randomBytes } from "node:crypto";
import { readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

import {
  parseWorkspaceManifest,
  type ParsedWorkspaceManifest,
} from "./features/manifest";
import { createLogger } from "./log";

const log = createLogger("workspace-manifest");

type JsonObject = Record<string, unknown>;
type GenerationStatus = "staged" | "active" | "stale";

interface ManifestGenerationState {
  raw: JsonObject;
  diskBaseline: string;
  status: GenerationStatus;
}

/**
 * A spot in one manifest generation where a settings object lives. `write`
 * aliases the given values into that generation. Staged writes stay detached;
 * active writes mark the store dirty only when the JSON value changed; stale
 * writes reject.
 */
export interface ManifestLocation {
  read(): JsonObject | undefined;
  write(values: JsonObject): void;
}

/** A mutable manifest generation read from disk but not yet made live. */
export interface StagedWorkspaceManifest {
  readonly manifestPath: string;
  readonly composition: ParsedWorkspaceManifest;
  featureEntrySettings(manifestIndex: number): ManifestLocation;
  settingsNamespace(namespace: string): ManifestLocation;
}

interface WorkspaceManifestStoreOptions {
  flushDebounceMs?: number;
}

export class WorkspaceManifestStore implements Disposable {
  readonly #manifestPath: string;
  readonly #flushDebounceMs: number;
  readonly #staged = new WeakMap<
    StagedWorkspaceManifest,
    ManifestGenerationState
  >();
  #active: ManifestGenerationState | undefined;
  #persistedJson: string | undefined;
  #dirty = false;
  #flushTimer: NodeJS.Timeout | undefined;
  #disposed = false;

  constructor(manifestPath: string, opts: WorkspaceManifestStoreOptions = {}) {
    this.#manifestPath = manifestPath;
    this.#flushDebounceMs = opts.flushDebounceMs ?? 5000;
  }

  /**
   * Reads disk into an independent mutable generation. The active generation,
   * dirty state, and pending flush remain untouched until `promote` succeeds.
   */
  async stageFromDisk(): Promise<StagedWorkspaceManifest> {
    if (this.#disposed) {
      throw new Error("WorkspaceManifestStore is disposed");
    }
    const parsed = await readRawManifest(this.#manifestPath);
    const composition = parseWorkspaceManifest(parsed, this.#manifestPath);
    const state: ManifestGenerationState = {
      raw: parsed as JsonObject,
      diskBaseline: JSON.stringify(parsed),
      status: "staged",
    };
    const staged: StagedWorkspaceManifest = {
      manifestPath: this.#manifestPath,
      composition,
      featureEntrySettings: (manifestIndex) =>
        this.#featureEntrySettings(state, manifestIndex),
      settingsNamespace: (namespace) =>
        this.#settingsNamespace(state, namespace),
    };
    this.#staged.set(staged, state);
    return staged;
  }

  /** Promotes one staged generation to active exactly once. */
  promote(staged: StagedWorkspaceManifest): void {
    if (this.#disposed) {
      throw new Error("WorkspaceManifestStore is disposed");
    }
    const next = this.#staged.get(staged);
    if (!next) {
      throw new Error("Workspace manifest was not staged by this store");
    }
    if (next.status !== "staged") {
      throw new Error(`Workspace manifest is already ${next.status}`);
    }
    if (this.#active) this.#active.status = "stale";
    this.#clearFlushTimer();
    this.#active = next;
    next.status = "active";
    this.#persistedJson = next.diskBaseline;
    this.#dirty = JSON.stringify(next.raw) !== next.diskBaseline;
    this.#scheduleFlush();
  }

  /** Location of `features[manifestIndex].settings` in the active generation. */
  featureEntrySettings(manifestIndex: number): ManifestLocation {
    return this.#featureEntrySettings(this.#requireActive(), manifestIndex);
  }

  async flush(): Promise<void> {
    this.#clearFlushTimer();
    if (!this.#dirty) return;

    const active = this.#requireActive();
    const currentJson = JSON.stringify(active.raw);
    if (currentJson === this.#persistedJson) {
      this.#dirty = false;
      return;
    }

    this.#dirty = false;
    try {
      await atomicWriteFile(
        this.#manifestPath,
        `${JSON.stringify(active.raw, null, 2)}\n`,
      );
      this.#persistedJson = currentJson;
    } catch (err) {
      this.#dirty = true;
      this.#scheduleFlush();
      throw err;
    }
  }

  [Symbol.dispose](): void {
    if (this.#disposed) return;
    this.#disposed = true;
    if (this.#active) this.#active.status = "stale";
    this.#clearFlushTimer();
  }

  #featureEntrySettings(
    state: ManifestGenerationState,
    manifestIndex: number,
  ): ManifestLocation {
    return this.#location(
      state,
      (raw) => requireManifestFeatureEntry(raw, manifestIndex),
      "settings",
    );
  }

  #settingsNamespace(
    state: ManifestGenerationState,
    namespace: string,
  ): ManifestLocation {
    return this.#location(
      state,
      (raw, create) =>
        create ? getOrCreateRecord(raw, "settings") : asRecord(raw["settings"]),
      namespace,
    );
  }

  #location(
    state: ManifestGenerationState,
    parent: (raw: JsonObject, create: boolean) => JsonObject | undefined,
    key: string,
  ): ManifestLocation {
    return {
      read: () => asRecord(parent(state.raw, false)?.[key]),
      write: (values) => {
        this.#assertWritable(state);
        const target = parent(state.raw, true);
        if (!target) {
          throw new Error(`workspace manifest has no parent for ${key}`);
        }
        const changed = !isJsonEqual(target[key], values);
        target[key] = values;
        if (changed && state.status === "active") {
          this.#dirty = true;
          this.#scheduleFlush();
        }
      },
    };
  }

  #assertWritable(state: ManifestGenerationState): void {
    if (this.#disposed) {
      throw new Error("WorkspaceManifestStore is disposed");
    }
    if (state.status === "stale") {
      throw new Error("Workspace manifest generation is stale");
    }
  }

  #requireActive(): ManifestGenerationState {
    if (!this.#active) {
      throw new Error("WorkspaceManifestStore has no active manifest");
    }
    return this.#active;
  }

  #scheduleFlush(): void {
    if (!this.#dirty) return;
    this.#clearFlushTimer();
    this.#flushTimer = setTimeout(() => {
      void this.flush().catch((err: unknown) => {
        log.warn(
          { err: err instanceof Error ? err.message : String(err) },
          "flush_failed",
        );
      });
    }, this.#flushDebounceMs);
  }

  #clearFlushTimer(): void {
    if (!this.#flushTimer) return;
    clearTimeout(this.#flushTimer);
    this.#flushTimer = undefined;
  }
}

async function readRawManifest(manifestPath: string): Promise<unknown> {
  let raw: string;
  try {
    raw = await readFile(manifestPath, "utf8");
  } catch (err) {
    throw new Error(
      `workspace manifest unreadable: ${manifestPath} (${(err as Error).message})`,
      { cause: err },
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new Error(
      `workspace manifest is not valid JSON: ${manifestPath} (${(err as Error).message})`,
      { cause: err },
    );
  }
  return parsed;
}

function requireManifestFeatureEntry(
  rawManifest: JsonObject,
  manifestIndex: number,
): JsonObject {
  const features = rawManifest["features"] as JsonObject[];
  const feature = features[manifestIndex];
  if (feature) return feature;
  throw new Error(
    `workspace manifest has no feature entry at index ${String(manifestIndex)}`,
  );
}

function getOrCreateRecord(parent: JsonObject, key: string): JsonObject {
  const existing = parent[key];
  if (isRecord(existing)) return existing;
  const created: JsonObject = {};
  parent[key] = created;
  return created;
}

async function atomicWriteFile(
  targetPath: string,
  content: string,
): Promise<void> {
  const dir = path.dirname(targetPath);
  const tempPath = path.join(
    dir,
    `.${path.basename(targetPath)}.${process.pid}.${Date.now()}.${randomBytes(6).toString("hex")}.tmp`,
  );

  try {
    await writeFile(tempPath, content, "utf8");
    await rename(tempPath, targetPath);
  } catch (err) {
    await rm(tempPath, { force: true }).catch(() => undefined);
    throw err;
  }
}

function asRecord(value: unknown): JsonObject | undefined {
  return isRecord(value) ? value : undefined;
}

function isJsonEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function isRecord(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
