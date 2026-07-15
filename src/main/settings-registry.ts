// Live settings state and routing, with persistence fully externalized.
//
// A scope is one schema-validated object exposed through keyed convenience
// operations. Feature ids and substrate workspace namespaces share one
// unprefixed scope-id space;
// duplicate registration throws, which is what lets substrate namespaces
// (registered first, on reload) collide naturally with feature ids.
//
// The registry never reads files, resolves manifest locations, or hydrates
// defaults — `registerScope` takes a finished scope, and persistence exists here
// only as each scope's injected write-back hook. The choreography that
// builds a scope from a manifest location lives in `loadScope`
// (read → hydrate → install), with the schema logic in the pure
// `hydrateSettings`.

import type { SettingsDefinition, SettingsHandle } from "@uix/api/settings";
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
 * Pure schema pass over one complete scope: merge explicit defaults into
 * persisted values, then validate the resulting object. `changed` reports
 * whether the materialized value needs writing back.
 */
export function hydrateSettings(
  definition: SettingsDefinition,
  persisted: JsonObject | undefined,
  label: string,
): HydratedValues {
  let values: JsonObject;
  try {
    const defaults =
      definition.default === undefined
        ? {}
        : Value.Parse(definition.schema, cloneJson(definition.default));
    const merged = mergeJsonDefaults(defaults, cloneJson(persisted ?? {}));
    values = Value.Parse(definition.schema, merged);
  } catch (err) {
    throw new Error(
      `Invalid settings for ${label}: ${(err as Error).message}`,
      {
        cause: err,
      },
    );
  }
  return { values, changed: !jsonEqual(persisted, values) };
}

/** A finished scope, ready for `SettingsRegistry.registerScope`. */
export interface SettingsScope {
  /** Human label for error messages, e.g. `feature chat`. */
  label: string;
  definition: SettingsDefinition;
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
  definition: SettingsDefinition,
  location: ManifestLocation,
  label: string,
): SettingsScope {
  const { values, changed } = hydrateSettings(
    definition,
    location.read(),
    label,
  );
  if (changed) location.install(values);
  return {
    label,
    definition,
    values,
    onWrite: (v) => {
      location.install(v);
    },
  };
}

interface ScopeState {
  label: string;
  schema: TSchema;
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
    this.#scopes.set(scopeId, {
      label: scope.label,
      schema: scope.definition.schema,
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
    this.#assertKey(scope, key);
    const value = scope.values[key];
    if (value === undefined) return undefined;
    return cloneJson(value);
  }

  set(scopeId: string, key: string, value: unknown): void {
    if (this.#disposed) {
      throw new Error("SettingsRegistry is disposed");
    }
    const scope = this.#requireScope(scopeId);
    this.#assertKey(scope, key);
    if (value === undefined) {
      throw new Error(
        `Invalid setting for ${scope.label}: ${key} cannot be undefined`,
      );
    }
    const candidate = cloneJsonObject(scope.values);
    candidate[key] = cloneJson(value);
    const parsed = Value.Parse(scope.schema, candidate) as JsonObject;
    scope.values = parsed;
    scope.onWrite?.(parsed);
    this.#notify(scopeId, key, parsed[key]);
  }

  onChange(scopeId: string, key: string, handler: Listener): () => void {
    if (this.#disposed) {
      throw new Error("SettingsRegistry is disposed");
    }
    this.#assertKey(this.#requireScope(scopeId), key);
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

  #assertKey(scope: ScopeState, key: string): void {
    const schema = scope.schema as TSchema & {
      properties?: Record<string, TSchema>;
      patternProperties?: Record<string, TSchema>;
    };
    if (schema.properties && Object.hasOwn(schema.properties, key)) return;
    for (const pattern of Object.keys(schema.patternProperties ?? {})) {
      if (new RegExp(pattern).test(key)) return;
    }
    throw new Error(`Unknown setting for ${scope.label}: ${key}`);
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
