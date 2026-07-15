// Composition facade wiring `WorkspaceManifestStore` and `SettingsRegistry`
// together for the substrate's two settings scopes: manifest feature entries
// and substrate-owned workspace namespaces.
//
// The loader keeps its narrow interface (`reload` / `loadFeatureScope` /
// `forScope`) and never learns the manifest concept exists; main-process
// substrate code reads workspace namespaces through the same `forScope` —
// feature ids and namespaces share one flat scope-id space.

import type { SettingsDefinition, SettingsHandle } from "@uix/api/settings";

import { DisposableBag } from "./lifecycle";
import {
  hydrateSettings,
  SettingsRegistry,
  type SettingsScope,
  type SettingsScopeRegistration,
} from "./settings-registry";
import type { WorkspaceManifestStore } from "./workspace-manifest-store";

export interface WorkspaceSettings {
  /**
   * Disk-wins reload: re-reads the manifest, then re-registers every
   * substrate namespace before any feature hydrates. Namespaces are staged
   * all-or-nothing — a bad persisted value rejects the reload without
   * touching the registry.
   */
  reload(): Promise<void>;
  loadFeatureScope(
    featureId: string,
    manifestIndex: number,
    settings: SettingsDefinition,
  ): SettingsScopeRegistration;
  /**
   * Handle for any scope — feature id or workspace namespace. Lazy: an
   * unknown scope throws on first use, not here, so handles survive
   * reload's clear-and-rehydrate.
   */
  forScope(scopeId: string): SettingsHandle;
}

export function createWorkspaceSettings(
  manifest: WorkspaceManifestStore,
  registry: SettingsRegistry,
  namespaces: Record<string, SettingsDefinition>,
): WorkspaceSettings {
  const namespaceBag = new DisposableBag();

  return {
    async reload() {
      await manifest.reload();
      for (const namespace of manifest.settingsNamespaces()) {
        if (!(namespace in namespaces)) {
          throw new Error(`Unknown workspace settings namespace: ${namespace}`);
        }
      }

      // Stage every namespace against the fresh tree before committing
      // anything — registry entries and manifest installs alike — so one
      // bad namespace can't leave the others half-registered or the tree
      // partially dirtied.
      const staged: {
        namespace: string;
        scope: SettingsScope;
      }[] = [];
      for (const [namespace, definition] of Object.entries(namespaces)) {
        const label = `workspace namespace ${namespace}`;
        const location = manifest.settingsNamespace(namespace);
        const values = hydrateSettings(definition, location.read(), label);
        staged.push({
          namespace,
          scope: {
            label,
            definition,
            values,
            onWrite: (v) => {
              location.install(v);
            },
          },
        });
      }

      registry.clearScopes();
      namespaceBag.clear();
      for (const { namespace, scope } of staged) {
        const registration = namespaceBag.add(
          registry.registerScope(namespace, scope),
        );
        registration.commit();
      }
    },

    loadFeatureScope(featureId, manifestIndex, settings) {
      const location = manifest.featureEntrySettings(manifestIndex);
      const label = `feature ${featureId}`;
      const values = hydrateSettings(settings, location.read(), label);
      return registry.registerScope(featureId, {
        label,
        definition: settings,
        values,
        onWrite: (next) => location.install(next),
      });
    },

    forScope: (scopeId) => registry.forScope(scopeId),
  };
}
