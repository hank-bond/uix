import { describe, expect, it, vi } from "vitest";

import { createWorkspaceReloadCoordinator } from "./workspace-reload";

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe("workspace reload coordinator", () => {
  it("restores replacements before publishing the changed composition", async () => {
    const restoreGate = deferred();
    const order: string[] = [];
    const coordinator = createWorkspaceReloadCoordinator({
      commitActiveFeatureTurnStateIfRestorationSettled: () =>
        Promise.resolve(true),
      activateReplacementFeatures: () => Promise.resolve({ activated: 2 }),
      reloadPiResources: () => Promise.resolve(true),
      restoreSelectedBranchTurnStateIntoActiveFeatureInstances: async () => {
        order.push("restore");
        await restoreGate.promise;
      },
      publishSurfacesChanged: () => {
        order.push("publish");
      },
    });

    const reload = coordinator.reload();
    await vi.waitFor(() => {
      expect(order).toEqual(["restore"]);
    });
    restoreGate.resolve();

    await expect(reload).resolves.toEqual({
      replacementActivation: { activated: 2 },
      piResourcesReloaded: true,
      turnStateCommitted: true,
    });
    expect(order).toEqual(["restore", "publish"]);
  });

  it("restores and publishes after the Pi resource reload fails", async () => {
    const order: string[] = [];
    const failure = new Error("Pi reload failed");
    const coordinator = createWorkspaceReloadCoordinator({
      commitActiveFeatureTurnStateIfRestorationSettled: () => {
        order.push("commit");
        return Promise.resolve(true);
      },
      activateReplacementFeatures: () => {
        order.push("activate");
        return Promise.resolve(undefined);
      },
      reloadPiResources: () => {
        order.push("pi");
        return Promise.reject(failure);
      },
      restoreSelectedBranchTurnStateIntoActiveFeatureInstances: () => {
        order.push("restore");
        return Promise.resolve();
      },
      publishSurfacesChanged: () => {
        order.push("publish");
      },
    });

    await expect(coordinator.reload()).rejects.toBe(failure);
    expect(order).toEqual(["commit", "activate", "pi", "restore", "publish"]);
  });

  it("publishes after restoration fails", async () => {
    const failure = new Error("restore failed");
    const publish = vi.fn();
    const coordinator = createWorkspaceReloadCoordinator({
      commitActiveFeatureTurnStateIfRestorationSettled: () =>
        Promise.resolve(true),
      activateReplacementFeatures: () => Promise.resolve(undefined),
      reloadPiResources: () => Promise.resolve(false),
      restoreSelectedBranchTurnStateIntoActiveFeatureInstances: () =>
        Promise.reject(failure),
      publishSurfacesChanged: publish,
    });

    await expect(coordinator.reload()).rejects.toBe(failure);
    expect(publish).toHaveBeenCalledOnce();
  });

  it("runs queued reloads one at a time and continues after failure", async () => {
    const firstGate = deferred();
    let reloadNumber = 0;
    const startedReloads: number[] = [];
    const coordinator = createWorkspaceReloadCoordinator({
      commitActiveFeatureTurnStateIfRestorationSettled: async () => {
        reloadNumber += 1;
        startedReloads.push(reloadNumber);
        if (reloadNumber === 1) await firstGate.promise;
        return true;
      },
      activateReplacementFeatures: () =>
        reloadNumber === 1
          ? Promise.reject(new Error("first activation failed"))
          : Promise.resolve(reloadNumber),
      reloadPiResources: () => Promise.resolve(false),
      restoreSelectedBranchTurnStateIntoActiveFeatureInstances: () =>
        Promise.resolve(),
      publishSurfacesChanged: () => undefined,
    });

    const firstReload = coordinator.reload();
    const secondReload = coordinator.reload();
    await Promise.resolve();
    expect(startedReloads).toEqual([1]);

    firstGate.resolve();
    await expect(firstReload).rejects.toThrow("first activation failed");
    await expect(secondReload).resolves.toMatchObject({
      replacementActivation: 2,
    });
    expect(startedReloads).toEqual([1, 2]);
  });
});
