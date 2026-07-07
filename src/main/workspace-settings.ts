import { randomBytes } from "node:crypto";
import { readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

import type {
  FeatureSettingDefinition,
  FeatureSettings,
} from "@uix/api/settings";
import type { TSchema } from "typebox";
import { Value } from "typebox/value";

import { disposable } from "./lifecycle";
import { createLogger } from "./log";

const log = createLogger("workspace-settings");

interface WorkspaceSettingsOptions {
  flushDebounceMs?: number;
}

type JsonObject = Record<string, unknown>;

type Listener = (value: unknown) => void;

interface RegisteredSetting {
  schema: TSchema;
}

export class WorkspaceSettings implements Disposable {
  readonly #manifestPath: string;
  readonly #flushDebounceMs: number;
  readonly #settings = new Map<string, JsonObject>();
  readonly #schemas = new Map<string, Map<string, RegisteredSetting>>();
  readonly #featureManifestIndexes = new Map<string, number>();
  readonly #dirtyFeatures = new Set<string>();
  readonly #listeners = new Map<string, Set<Listener>>();
  #rawManifest: JsonObject | undefined;
  #flushTimer: NodeJS.Timeout | undefined;
  #disposed = false;

  constructor(manifestPath: string, opts: WorkspaceSettingsOptions = {}) {
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
    definitions: readonly FeatureSettingDefinition[],
  ): void {
    if (this.#disposed) {
      throw new Error("WorkspaceSettings is disposed");
    }
    const rawManifest = this.requireRawManifest();
    const featureEntry = requireManifestFeatureEntry(
      rawManifest,
      manifestIndex,
    );
    const current = cloneJsonObject(featureEntry.settings);
    const schemas = new Map<string, RegisteredSetting>();

    for (const definition of definitions) {
      if (schemas.has(definition.key)) {
        throw new Error(
          `Duplicate setting key for feature ${featureId}: ${definition.key}`,
        );
      }
      schemas.set(definition.key, { schema: definition.schema });
    }

    for (const key of Object.keys(current)) {
      if (!schemas.has(key)) {
        throw new Error(`Unknown setting for feature ${featureId}: ${key}`);
      }
    }

    for (const definition of definitions) {
      const persisted = cloneJson(current[definition.key]);
      const hydrated = hydrateSetting(
        definition.schema,
        definition.default,
        persisted,
      );
      if (!jsonEqual(persisted, hydrated)) {
        current[definition.key] = hydrated;
        this.#dirtyFeatures.add(featureId);
      }
    }

    this.#schemas.set(featureId, schemas);
    this.#featureManifestIndexes.set(featureId, manifestIndex);
    this.#settings.set(featureId, current);
    featureEntry["settings"] = current;
    this.#scheduleFlush();
  }

  forFeature(featureId: string): FeatureSettings {
    return {
      get: <T = unknown>(key: string) =>
        this.get(featureId, key) as T | undefined,
      set: (key, value) => this.set(featureId, key, value),
      onChange: (key, handler) => this.onChange(featureId, key, handler),
    };
  }

  get(featureId: string, key: string): unknown {
    this.requireSetting(featureId, key);
    const value = this.#settings.get(featureId)?.[key];
    if (value === undefined) return undefined;
    return cloneJson(value);
  }

  set(featureId: string, key: string, value: unknown): void {
    if (this.#disposed) {
      throw new Error("WorkspaceSettings is disposed");
    }
    const setting = this.requireSetting(featureId, key);
    const parsed = Value.Parse(setting.schema, cloneJson(value));
    const featureSettings = this.#settings.get(featureId) ?? {};
    featureSettings[key] = parsed;
    this.#settings.set(featureId, featureSettings);
    requireManifestFeatureEntry(
      this.requireRawManifest(),
      this.requireManifestIndex(featureId),
    )["settings"] = featureSettings;
    this.#dirtyFeatures.add(featureId);
    this.#scheduleFlush();
    this.#notify(featureId, key, parsed);
  }

  onChange(featureId: string, key: string, handler: Listener): () => void {
    if (this.#disposed) {
      throw new Error("WorkspaceSettings is disposed");
    }
    this.requireSetting(featureId, key);
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

  async flush(): Promise<void> {
    this.#clearFlushTimer();
    if (this.#dirtyFeatures.size === 0) return;
    const flushing = new Set(this.#dirtyFeatures);
    try {
      await atomicWriteFile(
        this.#manifestPath,
        `${JSON.stringify(this.requireRawManifest(), null, 2)}\n`,
      );
    } catch (err) {
      this.#scheduleFlush();
      throw err;
    }
    for (const featureId of flushing) {
      this.#dirtyFeatures.delete(featureId);
    }
    this.#scheduleFlush();
  }

  [Symbol.dispose](): void {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#clearFlushTimer();
    this.#listeners.clear();
  }

  requireSetting(featureId: string, key: string): RegisteredSetting {
    const setting = this.#schemas.get(featureId)?.get(key);
    if (!setting) {
      throw new Error(`Unknown setting for feature ${featureId}: ${key}`);
    }
    return setting;
  }

  requireManifestIndex(featureId: string): number {
    const manifestIndex = this.#featureManifestIndexes.get(featureId);
    if (manifestIndex === undefined) {
      throw new Error(
        `Unknown settings manifest entry for feature ${featureId}`,
      );
    }
    return manifestIndex;
  }

  requireRawManifest(): JsonObject {
    if (!this.#rawManifest) {
      throw new Error("WorkspaceSettings has not loaded a manifest");
    }
    return this.#rawManifest;
  }

  #notify(featureId: string, key: string, value: unknown): void {
    const listeners = this.#listeners.get(toListenerKey(featureId, key));
    if (!listeners) return;
    for (const listener of listeners) {
      listener(cloneJson(value));
    }
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

export function bindFeatureSettings(
  settings: FeatureSettings,
  bag: { add<D extends Disposable>(item: D): D },
): FeatureSettings {
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
): JsonObject & { settings: JsonObject } {
  const features = rawManifest["features"];
  if (!Array.isArray(features)) {
    throw new Error("workspace manifest features is not an array");
  }
  const feature = (features as unknown[])[manifestIndex];
  if (isRecord(feature)) {
    const settings = asRecord(feature["settings"]) ?? {};
    feature["settings"] = settings;
    return feature as JsonObject & { settings: JsonObject };
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
