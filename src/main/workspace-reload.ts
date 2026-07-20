interface WorkspaceReloadCoordinatorOptions<TReplacementActivation> {
  commitActiveFeatureTurnStateIfRestorationSettled: () => Promise<boolean>;
  activateReplacementFeatures: () => Promise<TReplacementActivation>;
  reloadPiResources: () => Promise<boolean>;
  restoreSelectedBranchTurnStateIntoActiveFeatureInstances: () => Promise<void>;
  publishSurfacesChanged: () => void;
}

interface WorkspaceReloadCompletion<TReplacementActivation> {
  readonly replacementActivation: TReplacementActivation;
  readonly piResourcesReloaded: boolean;
  readonly turnStateCommitted: boolean;
}

interface WorkspaceReloadCoordinator<TReplacementActivation> {
  reload(): Promise<WorkspaceReloadCompletion<TReplacementActivation>>;
}

/**
 * Serializes whole-workspace replacement and keeps the renderer notification
 * behind both the Pi resource reload and replacement feature-state restoration.
 */
export function createWorkspaceReloadCoordinator<TReplacementActivation>(
  opts: WorkspaceReloadCoordinatorOptions<TReplacementActivation>,
): WorkspaceReloadCoordinator<TReplacementActivation> {
  let reloadTail: Promise<void> = Promise.resolve();

  const runReload = async (): Promise<
    WorkspaceReloadCompletion<TReplacementActivation>
  > => {
    const turnStateCommitted =
      await opts.commitActiveFeatureTurnStateIfRestorationSettled();
    const replacementActivation = await opts.activateReplacementFeatures();

    let piResourcesReloaded = false;
    const errors: unknown[] = [];
    try {
      piResourcesReloaded = await opts.reloadPiResources();
    } catch (thrown) {
      errors.push(thrown);
    }

    try {
      await opts.restoreSelectedBranchTurnStateIntoActiveFeatureInstances();
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
      replacementActivation,
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
