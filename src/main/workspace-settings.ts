// Workspace candidate/settings facade wiring `WorkspaceManifestStore` and
// `SettingsRegistry`. It stages and promotes one structurally validated
// manifest generation, returns that generation's accepted composition to the
// loader, and binds feature/workspace settings scopes to generation locations.
// Feature ids and substrate namespaces share one flat scope-id space.

import type { SettingsDefinition, SettingsHandle } from "@uix/api/settings";

import type { ParsedWorkspaceManifest } from "./features/manifest";
import { DisposableBag } from "./lifecycle";
import {
  hydrateSettings,
  SettingsRegistry,
  type SettingsScope,
  type SettingsScopeRegistration,
} from "./settings-registry";
import type { WorkspaceManifestStore } from "./workspace-manifest-store";

export type WorkspaceSettingsReload = ParsedWorkspaceManifest;

export interface WorkspaceSettings {
  /**
   * Disk-wins reload: stages and validates composition plus every substrate
   * namespace, then promotes the generation and replaces namespace scopes
   * before any feature hydrates. Rejection leaves the live store and registry
   * untouched.
   */
  reload(): Promise<WorkspaceSettingsReload>;
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
      const next = await manifest.stageFromDisk();
      const { composition } = next;
      for (const namespace of Object.keys(
        composition.manifest.settings ?? {},
      )) {
        if (!(namespace in namespaces)) {
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
      for (const [namespace, definition] of Object.entries(namespaces)) {
        const label = `workspace namespace ${namespace}`;
        const location = next.settingsNamespace(namespace);
        const values = hydrateSettings(definition, location.read(), label);
        location.write(values);
        staged.push({
          namespace,
          scope: {
            label,
            definition,
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

    loadFeatureScope(featureId, manifestIndex, settings) {
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

    forScope: (scopeId) => registry.forScope(scopeId),
  };
}
