// Reloads idle Workspace and Agent features before Pi resources, restored state, and renderer notification.
//
// Reload first commits turn state after restoration settles, or skips that commit when restoration is still pending. It stages and validates one manifest generation before promotion, then disposes the active composition and activates replacements. Reload requests serialize, and a successful reload gives disk precedence over pending debounced in-memory settings. Malformed manifests or workspace settings fail before promotion, so the active composition remains intact. Reload uses typed IPC, not an agent channel, and reconciles Pi only after replacing manifest features and workspace settings. It recreates the model or authentication services tier when one exists and calls Pi's native session reload when a live session exists. It never creates Pi services or a session solely to reload them.

interface WorkspaceReloadCoordinatorOptions<TFeatureActivation> {
  acquireReloadAdmission: () => Disposable;
  commitTurnState: () => Promise<boolean>;
  loadFeatures: () => Promise<TFeatureActivation>;
  featureCleanupErrors?: (activation: TFeatureActivation) => readonly unknown[];
  reloadAgentFeatures: () => Promise<readonly unknown[]>;
  reloadPiResources: () => Promise<boolean>;
  restoreTurnState: () => Promise<void>;
  publishSurfacesChanged: () => void;
}

interface WorkspaceReloadCompletion<TFeatureActivation> {
  readonly featureActivation: TFeatureActivation;
  readonly piResourcesReloaded: boolean;
  readonly turnStateCommitted: boolean;
}

interface WorkspaceReloadCoordinator<TFeatureActivation> {
  reload(): Promise<WorkspaceReloadCompletion<TFeatureActivation>>;
}

/**
 * Serializes whole-workspace replacement and keeps the renderer notification
 * behind both the Pi resource reload and replacement feature-state restoration.
 */
export function createWorkspaceReloadCoordinator<TFeatureActivation>(
  opts: WorkspaceReloadCoordinatorOptions<TFeatureActivation>,
): WorkspaceReloadCoordinator<TFeatureActivation> {
  let reloadTail: Promise<void> = Promise.resolve();

  const runReload = async (): Promise<
    WorkspaceReloadCompletion<TFeatureActivation>
  > => {
    using _reloadAdmission = opts.acquireReloadAdmission();
    const turnStateCommitted = await opts.commitTurnState();
    const featureActivation = await opts.loadFeatures();
    const errors: unknown[] = [
      ...(opts.featureCleanupErrors?.(featureActivation) ?? []),
    ];
    try {
      errors.push(...(await opts.reloadAgentFeatures()));
    } catch (thrown) {
      errors.push(thrown);
    }

    let piResourcesReloaded = false;
    try {
      piResourcesReloaded = await opts.reloadPiResources();
    } catch (thrown) {
      errors.push(thrown);
    }

    try {
      await opts.restoreTurnState();
    } catch (thrown) {
      errors.push(thrown);
    }

    // Once activation has replaced the backend composition, the renderer must
    // be told even when the later Pi resource reload failed. Error surfaces and
    // successfully activated siblings are still the authoritative composition.
    opts.publishSurfacesChanged();

    if (errors.length > 1) {
      throw new AggregateError(
        errors,
        "Workspace reload completed with one or more failures",
      );
    }
    if (errors.length === 1) throw errors[0];

    return {
      featureActivation,
      piResourcesReloaded,
      turnStateCommitted,
    };
  };

  return {
    reload() {
      const reload = reloadTail.then(runReload);
      reloadTail = reload.then(
        () => undefined,
        () => undefined,
      );
      return reload;
    },
  };
}
