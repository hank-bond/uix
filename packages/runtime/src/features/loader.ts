// Loads the features selected by the workspace manifest and isolates failures so one feature cannot stop its siblings.
//
// Each pass validates candidate settings before replacement, then activates
// entries sequentially in manifest order. A provisional lifetime rolls back one
// failed feature without aborting its siblings.

import { createRequire } from "node:module";
import { dirname } from "node:path";

import { createJiti, type Jiti } from "jiti";
import { Type } from "typebox";

import { isIdToken } from "@uix/api/contribution-id";
import type { DocumentStoreFactory } from "@uix/api/documents";
import type { FeatureContext, FeatureDefinition } from "@uix/api/feature";
import { defineSettings, type SettingsHandle } from "@uix/api/settings";

import {
  type FeatureContributionRegistries,
  registerFeatureContributions,
} from "./contributions";
import type { ManifestFeatureRef } from "./manifest";
import type { ChannelRegistry } from "../channel-registry";
import { createFeatureEventPublisherFactory } from "../channel-registry";
import { DisposableBag } from "../lifecycle";
import { createLogger } from "../log";
import { bindSettingsHandle } from "../settings-registry";
import type { WorkspaceSettings } from "../workspace-settings";

const log = createLogger("features");

const EmptyFeatureSettings = defineSettings({ schema: Type.Object({}) });

const requireFromLoader = createRequire(__filename);

/**
 * The alias table feature entry imports resolve through: exactly the
 * blessed backend set. `@uix/api` is a prefix mapping onto the
 * implementation dir the composition root provides (the API is
 * self-contained, so one directory serves it. When absent, features can
 * only type-import it and a value import fails loudly into `failed[]`).
 * typebox entries are exact because its package has no `main` (exports
 * map only), so a bare dir alias can't resolve.
 */
const deriveBuildAliases = (apiModuleDir?: string): Record<string, string> => ({
  ...(apiModuleDir ? { "@uix/api": apiModuleDir } : {}),
  typebox: requireFromLoader.resolve("typebox"),
  "typebox/value": requireFromLoader.resolve("typebox/value"),
});

const createFeatureJiti = (apiModuleDir?: string): Jiti =>
  createJiti(__filename, {
    // Same hot-reload lever Pi uses. Disabling the runtime module cache
    // lets editing a feature's .ts/.js file and reloading evaluate the
    // new source for the same absolute path. jiti may still keep its
    // filesystem transform cache for performance. That cache tracks
    // source state and is not the stale-module problem Node import() has.
    moduleCache: false,
    alias: deriveBuildAliases(apiModuleDir),
  });

/**
 * Feature ids the loader refuses outright: `agent` occupies the channel
 * registry (the substrate's prompt/history/event channels), and `uix`
 * prefixes substrate-owned session entry types (`uix.turn-state`,
 * `uix.state`).
 */
const ReservedFeatureIds: ReadonlySet<string> = new Set(["agent", "uix"]);

type FeatureActivationSettings = Pick<
  WorkspaceSettings,
  "reload" | "loadFeatureSettings"
>;

/** What the loader needs from the substrate to activate a feature. */
export interface FeatureSubstrate {
  documents: DocumentStoreFactory;
  settings: FeatureActivationSettings;
  channels: ChannelRegistry;
  registries: FeatureContributionRegistries;
  /**
   * On-disk dir of the `@uix/api` implementation feature imports resolve
   * to (the repo's `packages/api/src` in dev). Supplied by the composition root;
   * it's environment knowledge, not loader logic. When absent, features
   * can only type-import the API.
   */
  apiModuleDir?: string;
}

/** The feature sources a load pass composes. */
export interface FeatureSources {
  /**
   * Absolute path to the workspace's `uix.workspace.json`. Omitted when
   * the workspace has no manifest. No features load.
   */
  manifestPath?: string;
}

/**
 * Assembles the context bag a feature's `context`/`contribute` hooks receive.
 * One construction path for every feature. The substrate facets a feature
 * can touch are exactly what this returns.
 */
export function assembleFeatureContext(
  featureId: string,
  substrate: FeatureSubstrate,
  settings: SettingsHandle,
  bag: DisposableBag,
): FeatureContext {
  return {
    documents: substrate.documents,
    settings: bindSettingsHandle(settings, bag),
    channels: createFeatureEventPublisherFactory(featureId, substrate.channels),
    log: createLogger(featureId),
  };
}

/** One activated feature instance produced by a successful activation. */
export interface ActivatedFeatureInstance {
  /** The definition's feature id: keys every facet contribution. */
  id: string;
  /** The manifest ref as written. */
  displayName: string;
  /** Absolute entry-file path. */
  entry: string;
  /** Per-feature bag. Disposing it removes all the feature's contributions. */
  bag: DisposableBag;
}

/**
 * A single entry whose activation threw. Separate type from
 * `ActivatedFeatureInstance` because the use cases diverge: activated
 * instances contribute behavior. Failed entries are inert, surfaced in logs and
 * (eventually) a status panel. Keeping them in different arrays
 * means callers don't have to narrow a discriminator and can't
 * accidentally treat a failed feature as if it had a bag. No `id`
 * field: failure can precede a valid definition (bad export, bad id).
 */
export interface FailedFeature {
  /** The manifest ref as written. */
  displayName: string;
  /** Absolute entry-file path. */
  entry: string;
  /** The thrown value, normalized to an Error instance. */
  error: Error;
}

/** Result of a feature activation pass. */
export interface ActivationResult {
  activated: ActivatedFeatureInstance[];
  failed: FailedFeature[];
  /** Accepted workspace name, when this pass loaded a manifest. */
  workspaceName?: string;
}

const normalize = (thrown: unknown): Error =>
  thrown instanceof Error ? thrown : new Error(String(thrown));

/**
 * Narrows an entry's `feature` export to a FeatureDefinition or throws
 * with a message that names what's wrong. The throw lands in
 * `failed[]` like any other activation error.
 */
const validateFeatureDefinition = (value: unknown): FeatureDefinition => {
  if (typeof value !== "object" || value === null) {
    throw new Error(
      "exported `feature` is not a FeatureDefinition (expected an object with id + contribute)",
    );
  }
  const def = value as Partial<FeatureDefinition>;
  if (typeof def.id !== "string" || !isIdToken(def.id)) {
    throw new Error(
      `FeatureDefinition id is missing or invalid: ${String(def.id)}`,
    );
  }
  if (typeof def.contribute !== "function") {
    throw new Error(`FeatureDefinition ${def.id} has no contribute() function`);
  }
  if (def.context !== undefined && typeof def.context !== "function") {
    throw new Error(`FeatureDefinition ${def.id} context is not a function`);
  }
  if (def.settings !== undefined) {
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- exported feature objects are untrusted module code. Null is a real runtime value and typeof null === "object", so the null check is load-bearing despite the non-nullable type.
    if (def.settings == null || typeof def.settings !== "object") {
      throw new Error(`FeatureDefinition ${def.id} settings is not an object`);
    }
    const schema = (def.settings as { schema?: unknown }).schema;
    if (!Type.IsObject(schema) && !Type.IsRecord(schema)) {
      throw new Error(
        `FeatureDefinition ${def.id} settings schema must be a Type.Object or Type.Record`,
      );
    }
    if (
      (schema as { additionalProperties?: unknown }).additionalProperties !==
      false
    ) {
      throw new Error(
        `FeatureDefinition ${def.id} settings schema must reject unknown properties`,
      );
    }
  }
  return def as FeatureDefinition;
};

/**
 * Load an entry and return its `feature` export: the loader contract name.
 * Every feature entry exports `export const feature = defineFeature({ ... })`;
 * a default-only module is a contract violation, not a supported form.
 * jiti's interop proxy exposes named exports for both ESM and transpiled
 * modules, so the same call works for every workspace authoring style.
 */
const loadFeatureDefinition = async (
  entry: string,
  jiti: ReturnType<typeof createFeatureJiti>,
): Promise<unknown> => {
  const namespace = await jiti.import<Record<string, unknown>>(entry);
  if (namespace.feature === undefined) {
    throw new Error(
      "Feature entry does not export `feature` (expected `export const feature = defineFeature({ ... })`).",
    );
  }
  return namespace.feature;
};

/**
 * Activate the manifest's feature entries in manifest order. Each successful
 * entry produces its own ActivatedFeatureInstance with its own bag. A throwing
 * entry lands in `failed[]` instead of aborting the pass.
 *
 * @param entries resolved manifest refs, in manifest order.
 * @param parentBag the loader adds every per-feature bag here, so one
 *   disposal at host shutdown or reload clearing disposes everything.
 * @param substrate the facet registries and context ingredients the
 *   definitions register into.
 */
export const activateFeatures = async (
  entries: readonly ManifestFeatureRef[],
  parentBag: DisposableBag,
  substrate: FeatureSubstrate,
): Promise<ActivationResult> => {
  const activated: ActivatedFeatureInstance[] = [];
  const failed: FailedFeature[] = [];
  const takenIds = new Set<string>();
  const jiti = createFeatureJiti(substrate.apiModuleDir);

  const activate = async (
    manifestIndex: number,
    displayName: string,
    entry: string,
    loadDefinition: () => unknown,
    entryDir?: string,
    isBaseToolsProvider = false,
  ): Promise<void> => {
    const flog = log.child({ feature: displayName, entry });
    flog.debug({}, "activating");

    // The loader creates the per-feature bag early so every acquired lifetime
    // capability has an owner. We only enroll
    // it in the parent bag after activation succeeds. A
    // loader disposes a failed feature's bag immediately, and it never
    // becomes part of host-shutdown teardown.
    const bag = new DisposableBag();

    try {
      const definition = validateFeatureDefinition(await loadDefinition());

      if (ReservedFeatureIds.has(definition.id)) {
        throw new Error(`Feature id is reserved: ${definition.id}`);
      }
      if (takenIds.has(definition.id)) {
        throw new Error(`Feature id already registered: ${definition.id}`);
      }

      const featureSettings = bag.add(
        substrate.settings.loadFeatureSettings(
          definition.id,
          manifestIndex,
          definition.settings ?? EmptyFeatureSettings,
        ),
      );
      const baseContext = assembleFeatureContext(
        definition.id,
        substrate,
        featureSettings.settings,
        bag,
      );
      const contributedContext = definition.context?.(baseContext) ?? {};
      bag.add(
        registerFeatureContributions(
          substrate.registries,
          definition.id,
          definition.contribute({ ...baseContext, ...contributedContext }),
          { entryDir, isBaseToolsProvider },
        ),
      );
      featureSettings.commit();

      takenIds.add(definition.id);
      parentBag.add(bag);
      activated.push({ id: definition.id, displayName, entry, bag });
      flog.debug({ id: definition.id }, "activation_succeeded");
    } catch (thrown) {
      const error = normalize(thrown);
      // Tear down anything the definition added before it threw;
      // partial activation shouldn't leak
      // half-wired contributions.
      bag[Symbol.dispose]();
      failed.push({ displayName, entry, error });
      flog.error(
        { err: error.message, stack: error.stack },
        "activation_failed",
      );
    }
  };

  for (const { index, ref, entry, baseTools } of entries) {
    await activate(
      index,
      ref,
      entry,
      () => loadFeatureDefinition(entry, jiti),
      dirname(entry),
      baseTools === true,
    );
  }

  return { activated, failed };
};

/**
 * Load the whole feature composition, the workspace manifest's entries,
 * into the owned feature bag, replacing whatever that bag currently
 * contains. Safe for initial startup (empty clear) and for manual reload
 * (the loader disposes the active feature composition before replacement feature
 * instances activate with fresh contexts, callbacks, registered contributions,
 * and bags).
 *
 * The loader reads and validates the manifest before clearing, so a manifest
 * failure (unreadable, bad JSON, schema mismatch) rejects the pass and
 * leaves the active feature composition intact. Concurrent callers for one owned
 * feature bag share the same in-flight pass so its clear/activate never
 * overlaps. Independent workspace bags load independently.
 */
const inFlightFeatureLoadByBag = new WeakMap<
  DisposableBag,
  Promise<ActivationResult>
>();

export const loadFeatures = (
  sources: FeatureSources,
  featuresBag: DisposableBag,
  substrate: FeatureSubstrate,
): Promise<ActivationResult> => {
  const existing = inFlightFeatureLoadByBag.get(featuresBag);
  if (existing) return existing;

  const load: Promise<ActivationResult> = (async () => {
    let entries: readonly ManifestFeatureRef[] = [];
    let workspaceName: string | undefined;
    if (sources.manifestPath) {
      const { manifest, features } = await substrate.settings.reload();
      log.debug(
        {
          manifest: sources.manifestPath,
          workspace: manifest.name,
          features: features.map((f) => f.ref),
        },
        "manifest_read",
      );
      entries = features;
      workspaceName = manifest.name;
    }
    featuresBag.clear();
    const activation = await activateFeatures(entries, featuresBag, substrate);
    return {
      ...activation,
      ...(workspaceName !== undefined && { workspaceName }),
    };
  })().finally(() => {
    if (inFlightFeatureLoadByBag.get(featuresBag) === load) {
      inFlightFeatureLoadByBag.delete(featuresBag);
    }
  });

  inFlightFeatureLoadByBag.set(featuresBag, load);
  return load;
};
