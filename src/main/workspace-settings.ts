// Workspace candidate/settings facade wiring `WorkspaceManifestStore` and
// `SettingsRegistry`. It stages and promotes one structurally validated
// manifest generation, returns that generation's accepted composition to the
// loader, and binds feature/workspace settings scopes to generation locations.
// Feature ids and substrate namespaces share one flat scope-id space.

import type {
  SettingsDefinition,
  SettingsHandleFrom,
  SettingsValues,
} from "@uix/api/settings";

import type { ParsedWorkspaceManifest } from "./features/manifest";
import { DisposableBag } from "./lifecycle";
import {
  hydrateSettings,
  SettingsRegistry,
  type SettingsScope,
  type SettingsScopeRegistration,
} from "./settings-registry";
import type { WorkspaceManifestStore } from "./workspace-manifest-store";
import type {
  AnyWorkspaceSettingsNamespace,
  WorkspaceSettingsNamespace,
} from "./workspace-settings-namespace";

export type WorkspaceSettingsReload = ParsedWorkspaceManifest;

export interface WorkspaceNamespaceHandle<
  Namespace extends AnyWorkspaceSettingsNamespace,
> extends SettingsHandleFrom<Namespace> {
  getSnapshot(): SettingsValues<Namespace>;
  replace(candidate: SettingsValues<Namespace>): SettingsValues<Namespace>;
}

export interface WorkspaceSettings {
  /**
   * Disk-wins reload: stages and validates composition plus every substrate
   * namespace, then promotes the generation and replaces namespace scopes
   * before any feature hydrates. Rejection leaves the live store and registry
   * untouched.
   */
  reload(): Promise<WorkspaceSettingsReload>;
  loadFeatureSettings(
    featureId: string,
    manifestIndex: number,
    settings: SettingsDefinition,
  ): SettingsScopeRegistration;
  /** Mint a schema-bound handle from one registered namespace definition. */
  forNamespace<Namespace extends AnyWorkspaceSettingsNamespace>(
    namespace: Namespace,
  ): WorkspaceNamespaceHandle<Namespace>;
}

export function createWorkspaceSettings(
  manifest: WorkspaceManifestStore,
  registry: SettingsRegistry,
  namespaces: readonly AnyWorkspaceSettingsNamespace[],
): WorkspaceSettings {
  const namespaceBag = new DisposableBag();
  const namespaceById = new Map<string, AnyWorkspaceSettingsNamespace>();
  for (const namespace of namespaces) {
    if (namespaceById.has(namespace.id)) {
      throw new Error(
        `Workspace settings namespace duplicated: ${namespace.id}`,
      );
    }
    namespaceById.set(namespace.id, namespace);
  }

  return {
    async reload() {
      const next = await manifest.stageFromDisk();
      const { composition } = next;
      for (const namespace of Object.keys(
        composition.manifest.settings ?? {},
      )) {
        if (!namespaceById.has(namespace)) {
          throw new Error(`Unknown workspace settings namespace: ${namespace}`);
        }
      }

      // Every fallible read/hydration stays detached. Returning from this
      // preparation means promotion and namespace registration contain no
      // user code or schema work and can run synchronously as one adoption.
      const staged: {
        namespace: string;
        scope: SettingsScope;
      }[] = [];
      for (const namespace of namespaces) {
        const label = `workspace namespace ${namespace.id}`;
        const location = next.settingsNamespace(namespace.id);
        const values = hydrateSettings(namespace, location.read(), label);
        location.write(values);
        staged.push({
          namespace: namespace.id,
          scope: {
            label,
            definition: namespace,
            values,
            onWrite: (v) => {
              location.write(v);
            },
          },
        });
      }

      manifest.promote(next);
      registry.clearScopes();
      namespaceBag.clear();
      for (const { namespace, scope } of staged) {
        const registration = namespaceBag.add(
          registry.registerScope(namespace, scope),
        );
        registration.commit();
      }
      return composition;
    },

    loadFeatureSettings(featureId, manifestIndex, settings) {
      const location = manifest.featureEntrySettings(manifestIndex);
      const label = `feature ${featureId}`;
      const values = hydrateSettings(settings, location.read(), label);
      return registry.registerScope(featureId, {
        label,
        definition: settings,
        values,
        onWrite: (next) => location.write(next),
      });
    },

    forNamespace(namespace) {
      if (namespaceById.get(namespace.id) !== namespace) {
        throw new Error(
          `Workspace settings namespace is not registered: ${namespace.id}`,
        );
      }
      return createWorkspaceNamespaceHandle(registry, namespace.id);
    },
  };
}

function createWorkspaceNamespaceHandle<Definition extends SettingsDefinition>(
  registry: SettingsRegistry,
  namespace: string,
): WorkspaceNamespaceHandle<WorkspaceSettingsNamespace<string, Definition>> {
  const settings = registry.forScope(namespace);
  return {
    get: (key) => settings.get(key),
    set: (key, value) => settings.set(key, value),
    onChange: (key, handler) =>
      settings.onChange(key, (value) =>
        handler(value as SettingsValues<Definition>[typeof key] | undefined),
      ),
    getSnapshot: () =>
      registry.getScopeSnapshot(namespace) as SettingsValues<Definition>,
    replace: (candidate) =>
      registry.replaceScope(namespace, candidate) as SettingsValues<Definition>,
  };
}
