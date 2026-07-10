// Persistence owner for `uix.workspace.json`.
//
// Holds the parsed manifest tree and everything file-shaped about it: read,
// transactional disk-wins reload, dirty tracking, debounced atomic flush.
// Consumers never touch the tree directly — the store mints opaque
// `ManifestLocation` handles through purpose-built accessors, so knowledge
// of where things live in the JSON concentrates here. Future manifest
// regions are new accessors on this store; existing consumers never see
// them.

import { randomBytes } from "node:crypto";
import { readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

import { createLogger } from "./log";

const log = createLogger("workspace-manifest");

type JsonObject = Record<string, unknown>;

/**
 * A spot in the manifest tree where one settings object lives. `install`
 * aliases the given values object into the tree (creating parents) and
 * schedules a flush; because the whole tree is serialized on flush, later
 * in-place mutations of an installed object need only re-`install` to mark
 * the manifest dirty.
 */
export interface ManifestLocation {
  read(): JsonObject | undefined;
  install(values: JsonObject): void;
}

interface WorkspaceManifestStoreOptions {
  flushDebounceMs?: number;
}

export class WorkspaceManifestStore implements Disposable {
  readonly #manifestPath: string;
  readonly #flushDebounceMs: number;
  #raw: JsonObject | undefined;
  #dirty = false;
  #flushTimer: NodeJS.Timeout | undefined;
  #disposed = false;

  constructor(manifestPath: string, opts: WorkspaceManifestStoreOptions = {}) {
    this.#manifestPath = manifestPath;
    this.#flushDebounceMs = opts.flushDebounceMs ?? 5000;
  }

  /** Disk wins: replaces the tree only after the new read parses clean. */
  async reload(): Promise<void> {
    const raw = await readRawManifest(this.#manifestPath);
    const settings = raw["settings"];
    if (settings !== undefined && !isRecord(settings)) {
      throw new Error(
        `workspace manifest settings is not an object: ${this.#manifestPath}`,
      );
    }
    this.#clearFlushTimer();
    this.#dirty = false;
    this.#raw = raw;
  }

  /** Namespace keys persisted under the manifest-level `settings` object. */
  settingsNamespaces(): string[] {
    return Object.keys(asRecord(this.#requireRaw()["settings"]) ?? {});
  }

  /** Location of `features[manifestIndex].settings`. */
  featureEntrySettings(manifestIndex: number): ManifestLocation {
    return this.#location(
      (raw) => requireManifestFeatureEntry(raw, manifestIndex),
      "settings",
    );
  }

  /** Location of `settings[namespace]` at the manifest top level. */
  settingsNamespace(namespace: string): ManifestLocation {
    // Only `install` may create the top-level `settings` object — a read
    // of an absent namespace must not grow the manifest.
    return this.#location(
      (raw, create) =>
        create ? getOrCreateRecord(raw, "settings") : asRecord(raw["settings"]),
      namespace,
    );
  }

  async flush(): Promise<void> {
    this.#clearFlushTimer();
    if (!this.#dirty) return;
    this.#dirty = false;
    try {
      await atomicWriteFile(
        this.#manifestPath,
        `${JSON.stringify(this.#requireRaw(), null, 2)}\n`,
      );
    } catch (err) {
      this.#dirty = true;
      this.#scheduleFlush();
      throw err;
    }
    this.#scheduleFlush();
  }

  [Symbol.dispose](): void {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#clearFlushTimer();
  }

  #location(
    parent: (raw: JsonObject, create: boolean) => JsonObject | undefined,
    key: string,
  ): ManifestLocation {
    return {
      read: () => asRecord(parent(this.#requireRaw(), false)?.[key]),
      install: (values) => {
        if (this.#disposed) {
          throw new Error("WorkspaceManifestStore is disposed");
        }
        const target = parent(this.#requireRaw(), true);
        if (!target) {
          throw new Error(`workspace manifest has no parent for ${key}`);
        }
        target[key] = values;
        this.#dirty = true;
        this.#scheduleFlush();
      },
    };
  }

  #requireRaw(): JsonObject {
    if (!this.#raw) {
      throw new Error("WorkspaceManifestStore has not loaded a manifest");
    }
    return this.#raw;
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

async function readRawManifest(manifestPath: string): Promise<JsonObject> {
  const raw = await readFile(manifestPath, "utf8");
  const parsed = JSON.parse(raw) as unknown;
  if (!isRecord(parsed)) {
    throw new Error(`workspace manifest is not a JSON object: ${manifestPath}`);
  }
  return parsed;
}

function requireManifestFeatureEntry(
  rawManifest: JsonObject,
  manifestIndex: number,
): JsonObject {
  const features = rawManifest["features"];
  if (!Array.isArray(features)) {
    throw new Error("workspace manifest features is not an array");
  }
  const feature = (features as unknown[])[manifestIndex];
  if (isRecord(feature)) {
    return feature;
  }
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

function isRecord(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
