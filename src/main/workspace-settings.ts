// Composition facade wiring `WorkspaceManifestStore` and `SettingsRegistry`
// together for the substrate's two settings scopes: manifest feature entries
// and substrate-owned workspace namespaces.
//
// The loader keeps its narrow interface (`reload` / `loadFeatureScope` /
// `forScope`) and never learns the manifest concept exists; main-process
// substrate code reads workspace namespaces through the same `forScope` —
// feature ids and namespaces share one flat scope-id space.

import type { SettingsDefinition, SettingsHandle } from "@uix/api/settings";

import {
  loadScope,
  hydrateSettings,
  SettingsRegistry,
  type SettingsScope,
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
  ): void;
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
        install: boolean;
      }[] = [];
      for (const [namespace, definition] of Object.entries(namespaces)) {
        const label = `workspace namespace ${namespace}`;
        const location = manifest.settingsNamespace(namespace);
        const { values, changed } = hydrateSettings(
          definition,
          location.read(),
          label,
        );
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
          install: changed,
        });
      }

      registry.clearScopes();
      for (const { namespace, scope, install } of staged) {
        if (install) scope.onWrite?.(scope.values);
        registry.registerScope(namespace, scope);
      }
    },

    loadFeatureScope(featureId, manifestIndex, settings) {
      registry.registerScope(
        featureId,
        loadScope(
          settings,
          manifest.featureEntrySettings(manifestIndex),
          `feature ${featureId}`,
        ),
      );
    },

    forScope: (scopeId) => registry.forScope(scopeId),
  };
}
