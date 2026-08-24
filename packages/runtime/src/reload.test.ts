import { describe, expect, it, vi } from "vitest";

import { createWorkspaceReloadCoordinator } from "./reload";

const idleFeatureReload = {
  acquireReloadAdmission: () => ({
    [Symbol.dispose]: () => undefined,
  }),
  reloadAgentFeatures: () => Promise.resolve([]),
};

function deferred(): { promise: Promise<void>; resolve: () => void } {
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
      ...idleFeatureReload,
      commitTurnState: () => Promise.resolve(true),
      loadFeatures: () => Promise.resolve({ activated: 2 }),
      reloadPiResources: () => Promise.resolve(true),
      restoreTurnState: async () => {
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
      featureActivation: { activated: 2 },
      piResourcesReloaded: true,
      turnStateCommitted: true,
    });
    expect(order).toEqual(["restore", "publish"]);
  });

  it("restores and publishes after the Pi resource reload fails", async () => {
    const order: string[] = [];
    const failure = new Error("Pi reload failed");
    const coordinator = createWorkspaceReloadCoordinator({
      ...idleFeatureReload,
      commitTurnState: () => {
        order.push("commit");
        return Promise.resolve(true);
      },
      loadFeatures: () => {
        order.push("activate");
        return Promise.resolve(undefined);
      },
      reloadPiResources: () => {
        order.push("pi");
        return Promise.reject(failure);
      },
      restoreTurnState: () => {
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
      ...idleFeatureReload,
      commitTurnState: () => Promise.resolve(true),
      loadFeatures: () => Promise.resolve(undefined),
      reloadPiResources: () => Promise.resolve(false),
      restoreTurnState: () => Promise.reject(failure),
      publishSurfacesChanged: publish,
    });

    await expect(coordinator.reload()).rejects.toBe(failure);
    expect(publish).toHaveBeenCalledOnce();
  });

  it("finishes and publishes replacement before reporting cleanup failures", async () => {
    const workspaceCleanup = new Error("Workspace cleanup failed");
    const agentCleanup = new Error("Agent cleanup failed");
    const order: string[] = [];
    const coordinator = createWorkspaceReloadCoordinator({
      acquireReloadAdmission: idleFeatureReload.acquireReloadAdmission,
      commitTurnState: () => Promise.resolve(true),
      loadFeatures: () => {
        order.push("workspace");
        return Promise.resolve({ cleanupErrors: [workspaceCleanup] });
      },
      featureCleanupErrors: (activation) => activation.cleanupErrors,
      reloadAgentFeatures: () => {
        order.push("agent");
        return Promise.resolve([agentCleanup]);
      },
      reloadPiResources: () => {
        order.push("pi");
        return Promise.resolve(true);
      },
      restoreTurnState: () => {
        order.push("restore");
        return Promise.resolve();
      },
      publishSurfacesChanged: () => {
        order.push("publish");
      },
    });

    await expect(coordinator.reload()).rejects.toThrow(
      "Workspace reload completed with one or more failures",
    );
    expect(order).toEqual(["workspace", "agent", "pi", "restore", "publish"]);
  });

  it("runs queued reloads one at a time and continues after failure", async () => {
    const firstGate = deferred();
    let reloadNumber = 0;
    const startedReloads: number[] = [];
    const coordinator = createWorkspaceReloadCoordinator({
      ...idleFeatureReload,
      commitTurnState: async () => {
        reloadNumber += 1;
        startedReloads.push(reloadNumber);
        if (reloadNumber === 1) await firstGate.promise;
        return true;
      },
      loadFeatures: () =>
        reloadNumber === 1
          ? Promise.reject(new Error("first activation failed"))
          : Promise.resolve(reloadNumber),
      reloadPiResources: () => Promise.resolve(false),
      restoreTurnState: () => Promise.resolve(),
      publishSurfacesChanged: () => undefined,
    });

    const firstReload = coordinator.reload();
    const secondReload = coordinator.reload();
    await vi.waitFor(() => {
      expect(startedReloads).toEqual([1]);
    });

    firstGate.resolve();
    await expect(firstReload).rejects.toThrow("first activation failed");
    await expect(secondReload).resolves.toMatchObject({
      featureActivation: 2,
    });
    expect(startedReloads).toEqual([1, 2]);
  });
});
