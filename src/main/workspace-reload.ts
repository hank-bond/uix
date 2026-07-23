interface WorkspaceReloadCoordinatorOptions<TFeatureActivation> {
  commitTurnState: () => Promise<boolean>;
  loadFeatures: () => Promise<TFeatureActivation>;
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
    const turnStateCommitted = await opts.commitTurnState();
    const featureActivation = await opts.loadFeatures();

    let piResourcesReloaded = false;
    const errors: unknown[] = [];
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
        "Pi resource reload and feature turn-state restoration failed",
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
