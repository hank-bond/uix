// Restores feature state from the selected branch before allowing the driver to commit new state.

import type { SessionManager } from "@earendil-works/pi-coding-agent";

import { deriveSelectedBranchProjection } from "./branch-projection";
import type { AgentInstaller } from "./installers";
import {
  commitCurrentTurnState,
  createTurnStateInstaller,
  isSameTurnStateRegistrySnapshot,
  isTurnStateRegistrySnapshotCurrent,
  restoreTurnStateCellsAsOfLeaf,
  toTurnStateRegistrySnapshot,
  type TurnStateRegistry,
  type TurnStateRegistrySnapshot,
} from "../turn-state";

interface TurnStateCoordinatorOptions {
  readonly registry: TurnStateRegistry;
  readonly cwd: string;
}

interface TurnStateCoordinator extends Disposable {
  readonly agentInstaller: AgentInstaller;
  toRegistrySnapshot(): TurnStateRegistrySnapshot;
  isRestorationSettled(sessionManager: SessionManager): boolean;
  /**
   * Restore the manager's selected branch through this registry snapshot.
   * Returns false if the snapshot is no longer current before or after restore.
   * Equivalent in-flight requests share one operation.
   */
  restore(
    sessionManager: SessionManager,
    registrySnapshot: TurnStateRegistrySnapshot,
  ): Promise<boolean>;
  /**
   * Restore through the current registry unless this manager/registry pair has
   * already settled. Feature-level restore failures count as settled.
   */
  restoreCurrent(sessionManager: SessionManager): Promise<void>;
  commit(sessionManager: SessionManager): Promise<void>;
  /**
   * Returns false when no manager is available or restoration is pending.
   * Snapshot and commit failures still reject.
   */
  commitIfReady(sessionManager: SessionManager | undefined): Promise<boolean>;
  clearRestoration(): void;
}

/** Owns selected-branch commit and restore coordination. */
export function createTurnStateCoordinator(
  opts: TurnStateCoordinatorOptions,
): TurnStateCoordinator {
  let lastSettledRestoration:
    | {
        manager: SessionManager;
        registrySnapshot: TurnStateRegistrySnapshot;
      }
    | undefined;
  let inFlightRestorations: Array<{
    manager: SessionManager;
    registrySnapshot: TurnStateRegistrySnapshot;
    promise: Promise<boolean>;
  }> = [];
  let disposed = false;

  function isRestorationSettled(sessionManager: SessionManager): boolean {
    return (
      lastSettledRestoration?.manager === sessionManager &&
      isTurnStateRegistrySnapshotCurrent(
        opts.registry,
        lastSettledRestoration.registrySnapshot,
      )
    );
  }

  // Single source of the disposed guard. Fresh narrowing here so the re-check
  // after an await still sees `disposed` as a boolean: dispose() can run while
  // a restore/commit is awaiting, which TS's carried narrowing ignores.
  function assertNotDisposed(): void {
    if (disposed) throw new Error("Turn-state coordinator is disposed");
  }

  function restore(
    sessionManager: SessionManager,
    registrySnapshot: TurnStateRegistrySnapshot,
  ): Promise<boolean> {
    if (disposed) {
      return Promise.reject(new Error("Turn-state coordinator is disposed"));
    }
    const existing = inFlightRestorations.find(
      (entry) =>
        entry.manager === sessionManager &&
        isSameTurnStateRegistrySnapshot(
          entry.registrySnapshot,
          registrySnapshot,
        ),
    );
    if (existing) return existing.promise;

    const restoration = (async () => {
      if (
        !isTurnStateRegistrySnapshotCurrent(opts.registry, registrySnapshot)
      ) {
        return false;
      }
      const projection = deriveSelectedBranchProjection(
        sessionManager.getBranch(),
        sessionManager.getHeader()?.cwd || sessionManager.getCwd(),
        registrySnapshot,
      );
      await restoreTurnStateCellsAsOfLeaf(
        registrySnapshot,
        projection.turnStateAsOfLeaf,
      );
      assertNotDisposed();
      if (
        !isTurnStateRegistrySnapshotCurrent(opts.registry, registrySnapshot)
      ) {
        return false;
      }
      lastSettledRestoration = { manager: sessionManager, registrySnapshot };
      return true;
    })();
    const entry = {
      manager: sessionManager,
      registrySnapshot,
      promise: restoration,
    };
    inFlightRestorations.push(entry);
    const removeEntry = (): void => {
      const index = inFlightRestorations.indexOf(entry);
      if (index !== -1) inFlightRestorations.splice(index, 1);
    };
    void restoration.then(removeEntry, removeEntry);
    return restoration;
  }

  async function restoreCurrent(sessionManager: SessionManager): Promise<void> {
    if (isRestorationSettled(sessionManager)) return;
    await restore(sessionManager, toTurnStateRegistrySnapshot(opts.registry));
  }

  async function commit(sessionManager: SessionManager): Promise<void> {
    assertNotDisposed();
    await commitCurrentTurnState(sessionManager, opts.cwd, opts.registry);
  }

  return {
    agentInstaller: createTurnStateInstaller(opts.registry),
    toRegistrySnapshot: () => toTurnStateRegistrySnapshot(opts.registry),
    isRestorationSettled,
    restore,
    restoreCurrent,
    commit,

    async commitIfReady(sessionManager) {
      assertNotDisposed();
      if (!sessionManager || !isRestorationSettled(sessionManager)) {
        return false;
      }
      await commit(sessionManager);
      return true;
    },

    clearRestoration() {
      lastSettledRestoration = undefined;
    },

    [Symbol.dispose]() {
      if (disposed) return;
      disposed = true;
      lastSettledRestoration = undefined;
      inFlightRestorations = [];
    },
  };
}
