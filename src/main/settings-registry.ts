// Live settings state and routing, with persistence fully externalized.
//
// A scope is a flat bag of schema-validated cells. Feature ids and
// substrate workspace namespaces share one unprefixed scope-id space;
// duplicate registration throws, which is what lets substrate namespaces
// (registered first, on reload) collide naturally with feature ids.
//
// The registry never reads files, resolves manifest locations, or hydrates
// defaults — `registerScope` takes a finished scope, and persistence exists here
// only as each scope's injected write-back hook. The choreography that
// builds a scope from a manifest location lives in `loadScope`
// (read → hydrate → install), with the schema logic in the pure
// `hydrateSettings`.

import type { SettingDefinitions, SettingsHandle } from "@uix/api/settings";
import type { TSchema } from "typebox";
import { Value } from "typebox/value";

import { disposable } from "./lifecycle";
import type { ManifestLocation } from "./workspace-manifest-store";

type JsonObject = Record<string, unknown>;

type Listener = (value: unknown) => void;
type AnyListener = (scopeId: string, key: string, value: unknown) => void;

export interface HydratedValues {
  values: JsonObject;
  changed: boolean;
}

/**
 * Pure schema pass: validate persisted values against the definitions,
 * fill explicit defaults, reject unknown keys. Definitions without a
 * `default` are optional — absent stays absent. `changed` reports whether
 * `values` differs from what was persisted (i.e. needs writing back).
 */
export function hydrateSettings(
  definitions: SettingDefinitions,
  persisted: JsonObject | undefined,
  label: string,
): HydratedValues {
  const values = cloneJsonObject(persisted ?? {});
  for (const key of Object.keys(values)) {
    if (!(key in definitions)) {
      throw new Error(`Unknown setting for ${label}: ${key}`);
    }
  }

  let changed = false;
  for (const [key, definition] of Object.entries(definitions)) {
    const persistedValue = values[key];
    const hydrated = hydrateValue(
      definition.schema,
      definition.default,
      persistedValue,
    );
    if (hydrated === undefined) continue;
    if (!jsonEqual(persistedValue, hydrated)) {
      values[key] = hydrated;
      changed = true;
    }
  }
  return { values, changed };
}

/** A finished scope, ready for `SettingsRegistry.registerScope`. */
export interface SettingsScope {
  /** Human label for error messages, e.g. `feature chat`. */
  label: string;
  definitions: SettingDefinitions;
  values: JsonObject;
  /** Persistence hook invoked after every validated `set`. Omit for ephemeral scopes. */
  onWrite?: (values: JsonObject) => void;
}

/**
 * The common scope-boot choreography over a manifest location:
 * read persisted → hydrate → install when changed. Callers that need a
 * different transaction boundary (e.g. hydrate-all-then-commit on reload)
 * use `hydrateSettings` and assemble the scope themselves.
 */
export function loadScope(
  definitions: SettingDefinitions,
  location: ManifestLocation,
  label: string,
): SettingsScope {
  const { values, changed } = hydrateSettings(
    definitions,
    location.read(),
    label,
  );
  if (changed) location.install(values);
  return {
    label,
    definitions,
    values,
    onWrite: (v) => {
      location.install(v);
    },
  };
}

interface ScopeState {
  label: string;
  schemas: Map<string, TSchema>;
  values: JsonObject;
  onWrite?: (values: JsonObject) => void;
}

export class SettingsRegistry implements Disposable {
  readonly #scopes = new Map<string, ScopeState>();
  readonly #listeners = new Map<string, Set<Listener>>();
  readonly #anyListeners = new Set<AnyListener>();
  #disposed = false;

  registerScope(scopeId: string, scope: SettingsScope): void {
    if (this.#disposed) {
      throw new Error("SettingsRegistry is disposed");
    }
    if (this.#scopes.has(scopeId)) {
      throw new Error(`Settings scope already registered: ${scopeId}`);
    }
    const schemas = new Map<string, TSchema>();
    for (const [key, definition] of Object.entries(scope.definitions)) {
      schemas.set(key, definition.schema);
    }
    this.#scopes.set(scopeId, {
      label: scope.label,
      schemas,
      values: scope.values,
      ...(scope.onWrite && { onWrite: scope.onWrite }),
    });
  }

  /**
   * Drops all scopes (reload). Listeners survive — subscriptions are owned
   * by their subscribers' lifetimes (feature bags), not by scope identity.
   */
  clearScopes(): void {
    this.#scopes.clear();
  }

  get(scopeId: string, key: string): unknown {
    const scope = this.#requireScope(scopeId);
    this.#requireSchema(scope, key);
    const value = scope.values[key];
    if (value === undefined) return undefined;
    return cloneJson(value);
  }

  set(scopeId: string, key: string, value: unknown): void {
    if (this.#disposed) {
      throw new Error("SettingsRegistry is disposed");
    }
    const scope = this.#requireScope(scopeId);
    const schema = this.#requireSchema(scope, key);
    const parsed = Value.Parse(schema, cloneJson(value));
    scope.values[key] = parsed;
    scope.onWrite?.(scope.values);
    this.#notify(scopeId, key, parsed);
  }

  onChange(scopeId: string, key: string, handler: Listener): () => void {
    if (this.#disposed) {
      throw new Error("SettingsRegistry is disposed");
    }
    this.#requireSchema(this.#requireScope(scopeId), key);
    const listenerKey = toListenerKey(scopeId, key);
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
      throw new Error("SettingsRegistry is disposed");
    }
    this.#anyListeners.add(handler);

    let disposed = false;
    return () => {
      if (disposed) return;
      disposed = true;
      this.#anyListeners.delete(handler);
    };
  }

  forScope(scopeId: string): SettingsHandle {
    return {
      get: <T = unknown>(key: string) =>
        this.get(scopeId, key) as T | undefined,
      set: (key, value) => this.set(scopeId, key, value),
      onChange: (key, handler) => this.onChange(scopeId, key, handler),
    };
  }

  [Symbol.dispose](): void {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#scopes.clear();
    this.#listeners.clear();
    this.#anyListeners.clear();
  }

  #requireScope(scopeId: string): ScopeState {
    const scope = this.#scopes.get(scopeId);
    if (!scope) {
      throw new Error(`Unknown settings scope: ${scopeId}`);
    }
    return scope;
  }

  #requireSchema(scope: ScopeState, key: string): TSchema {
    const schema = scope.schemas.get(key);
    if (!schema) {
      throw new Error(`Unknown setting for ${scope.label}: ${key}`);
    }
    return schema;
  }

  #notify(scopeId: string, key: string, value: unknown): void {
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
      notify(() => listener(scopeId, key, cloneJson(cloned)));
    }
    const listeners = this.#listeners.get(toListenerKey(scopeId, key));
    if (listeners) {
      for (const listener of listeners) {
        notify(() => listener(cloneJson(cloned)));
      }
    }
    if (errors.length > 0) throw errors[0];
  }
}

export function bindSettingsHandle(
  settings: SettingsHandle,
  bag: { add<D extends Disposable>(item: D): D },
): SettingsHandle {
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

function hydrateValue(
  schema: TSchema,
  defaultValue: unknown,
  persisted: unknown,
): unknown {
  if (defaultValue === undefined) {
    if (persisted === undefined) return undefined;
    return Value.Parse(schema, cloneJson(persisted));
  }
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

function toListenerKey(scopeId: string, key: string): string {
  return `${scopeId}\0${key}`;
}

function cloneJsonObject(value: JsonObject): JsonObject {
  return cloneJson(value) as JsonObject;
}

function cloneJson(value: unknown): unknown {
  if (value === undefined) return undefined;
  const json = JSON.stringify(value);
  if (json === undefined) {
    throw new Error("Settings values must be JSON-serializable");
  }
  return JSON.parse(json) as unknown;
}

function jsonEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function isRecord(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
