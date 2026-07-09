import { randomBytes } from "node:crypto";
import { readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

import type { FeatureSettings, FeatureSettingsStore } from "@uix/api/settings";
import type { TSchema } from "typebox";
import { Value } from "typebox/value";

import { disposable } from "./lifecycle";
import { createLogger } from "./log";

const log = createLogger("workspace-settings");

interface WorkspaceSettingsStoreOptions {
  flushDebounceMs?: number;
}

type JsonObject = Record<string, unknown>;

type Listener = (value: unknown) => void;
type AnyListener = (featureId: string, key: string, value: unknown) => void;

interface RegisteredSetting {
  schema: TSchema;
}

export class WorkspaceSettingsStore implements Disposable {
  readonly #manifestPath: string;
  readonly #flushDebounceMs: number;
  readonly #settings = new Map<string, JsonObject>();
  readonly #schemas = new Map<string, Map<string, RegisteredSetting>>();
  readonly #featureManifestIndexes = new Map<string, number>();
  readonly #dirtyFeatures = new Set<string>();
  readonly #listeners = new Map<string, Set<Listener>>();
  readonly #anyListeners = new Set<AnyListener>();
  #rawManifest: JsonObject | undefined;
  #flushTimer: NodeJS.Timeout | undefined;
  #disposed = false;

  constructor(manifestPath: string, opts: WorkspaceSettingsStoreOptions = {}) {
    this.#manifestPath = manifestPath;
    this.#flushDebounceMs = opts.flushDebounceMs ?? 5000;
  }

  async reload(): Promise<void> {
    const rawManifest = await readRawManifest(this.#manifestPath);

    this.#clearFlushTimer();
    this.#dirtyFeatures.clear();
    this.#schemas.clear();
    this.#featureManifestIndexes.clear();
    this.#settings.clear();
    this.#rawManifest = rawManifest;
  }

  hydrateFeature(
    featureId: string,
    manifestIndex: number,
    settings: FeatureSettings,
  ): void {
    if (this.#disposed) {
      throw new Error("WorkspaceSettingsStore is disposed");
    }
    const rawManifest = this.#requireRawManifest();
    const featureEntry = requireManifestFeatureEntry(
      rawManifest,
      manifestIndex,
    );
    const current = cloneJsonObject(asRecord(featureEntry["settings"]) ?? {});
    const schemas = new Map<string, RegisteredSetting>();

    for (const [key, setting] of Object.entries(settings)) {
      schemas.set(key, { schema: setting.schema });
    }

    for (const key of Object.keys(current)) {
      if (!schemas.has(key)) {
        throw new Error(`Unknown setting for feature ${featureId}: ${key}`);
      }
    }

    let featureDirty = false;
    for (const [key, setting] of Object.entries(settings)) {
      const persisted = cloneJson(current[key]);
      const hydrated = hydrateSetting(
        setting.schema,
        setting.default,
        persisted,
      );
      if (!jsonEqual(persisted, hydrated)) {
        current[key] = hydrated;
        featureDirty = true;
      }
    }

    if (featureDirty) this.#dirtyFeatures.add(featureId);
    this.#schemas.set(featureId, schemas);
    this.#featureManifestIndexes.set(featureId, manifestIndex);
    this.#settings.set(featureId, current);
    featureEntry["settings"] = current;
    this.#scheduleFlush();
  }

  forFeature(featureId: string): FeatureSettingsStore {
    return {
      get: <T = unknown>(key: string) =>
        this.get(featureId, key) as T | undefined,
      set: (key, value) => this.set(featureId, key, value),
      onChange: (key, handler) => this.onChange(featureId, key, handler),
    };
  }

  get(featureId: string, key: string): unknown {
    this.#requireSetting(featureId, key);
    const value = this.#settings.get(featureId)?.[key];
    if (value === undefined) return undefined;
    return cloneJson(value);
  }

  set(featureId: string, key: string, value: unknown): void {
    if (this.#disposed) {
      throw new Error("WorkspaceSettingsStore is disposed");
    }
    const setting = this.#requireSetting(featureId, key);
    const parsed = Value.Parse(setting.schema, cloneJson(value));
    const featureSettings = this.#settings.get(featureId) ?? {};
    featureSettings[key] = parsed;
    this.#settings.set(featureId, featureSettings);
    requireManifestFeatureEntry(
      this.#requireRawManifest(),
      this.#requireManifestIndex(featureId),
    )["settings"] = featureSettings;
    this.#dirtyFeatures.add(featureId);
    this.#scheduleFlush();
    this.#notify(featureId, key, parsed);
  }

  onChange(featureId: string, key: string, handler: Listener): () => void {
    if (this.#disposed) {
      throw new Error("WorkspaceSettingsStore is disposed");
    }
    this.#requireSetting(featureId, key);
    const listenerKey = toListenerKey(featureId, key);
    const listeners = this.#listeners.get(listenerKey) ?? new Set<Listener>();
    listeners.add(handler);
    this.#listeners.set(listenerKey, listeners);

    let disposed = false;
    return () => {
      if (disposed) return;
      disposed = true;
      listeners.delete(handler);
      if (listeners.size === 0) this.#listeners.delete(listenerKey);
    };
  }

  onAnyChange(handler: AnyListener): () => void {
    if (this.#disposed) {
      throw new Error("WorkspaceSettingsStore is disposed");
    }
    this.#anyListeners.add(handler);

    let disposed = false;
    return () => {
      if (disposed) return;
      disposed = true;
      this.#anyListeners.delete(handler);
    };
  }

  async flush(): Promise<void> {
    this.#clearFlushTimer();
    if (this.#dirtyFeatures.size === 0) return;
    const flushing = new Set(this.#dirtyFeatures);
    this.#dirtyFeatures.clear();
    try {
      await atomicWriteFile(
        this.#manifestPath,
        `${JSON.stringify(this.#requireRawManifest(), null, 2)}\n`,
      );
    } catch (err) {
      for (const featureId of flushing) {
        this.#dirtyFeatures.add(featureId);
      }
      this.#scheduleFlush();
      throw err;
    }
    this.#scheduleFlush();
  }

  [Symbol.dispose](): void {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#clearFlushTimer();
    this.#listeners.clear();
    this.#anyListeners.clear();
  }

  #requireSetting(featureId: string, key: string): RegisteredSetting {
    const setting = this.#schemas.get(featureId)?.get(key);
    if (!setting) {
      throw new Error(`Unknown setting for feature ${featureId}: ${key}`);
    }
    return setting;
  }

  #requireManifestIndex(featureId: string): number {
    const manifestIndex = this.#featureManifestIndexes.get(featureId);
    if (manifestIndex === undefined) {
      throw new Error(
        `Unknown settings manifest entry for feature ${featureId}`,
      );
    }
    return manifestIndex;
  }

  #requireRawManifest(): JsonObject {
    if (!this.#rawManifest) {
      throw new Error("WorkspaceSettingsStore has not loaded a manifest");
    }
    return this.#rawManifest;
  }

  #notify(featureId: string, key: string, value: unknown): void {
    const cloned = cloneJson(value);
    const errors: unknown[] = [];
    const notify = (run: () => void) => {
      try {
        run();
      } catch (err) {
        errors.push(err);
      }
    };

    for (const listener of this.#anyListeners) {
      notify(() => listener(featureId, key, cloneJson(cloned)));
    }
    const listeners = this.#listeners.get(toListenerKey(featureId, key));
    if (listeners) {
      for (const listener of listeners) {
        notify(() => listener(cloneJson(cloned)));
      }
    }
    if (errors.length > 0) throw errors[0];
  }

  #scheduleFlush(): void {
    if (this.#dirtyFeatures.size === 0) return;
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

export function bindFeatureSettingsStore(
  settings: FeatureSettingsStore,
  bag: { add<D extends Disposable>(item: D): D },
): FeatureSettingsStore {
  return {
    get: (key) => settings.get(key),
    set: (key, value) => settings.set(key, value),
    onChange: (key, handler) => {
      const unsubscribe = settings.onChange(key, handler);
      bag.add(disposable(unsubscribe));
      return unsubscribe;
    },
  };
}

async function readRawManifest(manifestPath: string): Promise<JsonObject> {
  const raw = await readFile(manifestPath, "utf8");
  const parsed = JSON.parse(raw) as unknown;
  if (!isRecord(parsed)) {
    throw new Error(`workspace manifest is not a JSON object: ${manifestPath}`);
  }
  return parsed;
}

function hydrateSetting(
  schema: TSchema,
  defaultValue: unknown,
  persisted: unknown,
): unknown {
  const parsedDefault = Value.Parse(schema, cloneJson(defaultValue));
  if (persisted === undefined) return parsedDefault;
  const merged = mergeJsonDefaults(parsedDefault, cloneJson(persisted));
  return Value.Parse(schema, merged);
}

function mergeJsonDefaults(defaultValue: unknown, persisted: unknown): unknown {
  if (!isRecord(defaultValue) || !isRecord(persisted)) {
    return persisted;
  }
  const merged = cloneJsonObject(defaultValue);
  for (const [key, value] of Object.entries(persisted)) {
    merged[key] = mergeJsonDefaults(merged[key], value);
  }
  return merged;
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

function toListenerKey(featureId: string, key: string): string {
  return `${featureId}\0${key}`;
}

function cloneJsonObject(value: JsonObject): JsonObject {
  return cloneJson(value) as JsonObject;
}

function cloneJson(value: unknown): unknown {
  if (value === undefined) return undefined;
  const json = JSON.stringify(value);
  if (json === undefined) {
    throw new Error("Workspace settings values must be JSON-serializable");
  }
  return JSON.parse(json) as unknown;
}

function jsonEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function asRecord(value: unknown): JsonObject | undefined {
  return isRecord(value) ? value : undefined;
}

function isRecord(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
