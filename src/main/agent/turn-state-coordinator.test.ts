import type {
  SessionEntry,
  SessionManager,
} from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { describe, expect, it, vi, type Mock } from "vitest";

import {
  registerTurnStateContributions,
  TurnStateRegistry,
} from "../turn-state/registry";
import { createTurnStateCoordinator } from "./turn-state-coordinator";

function turnStateEntry(state: Record<string, unknown>): SessionEntry {
  return {
    id: "turn-state",
    parentId: undefined,
    timestamp: new Date(0).toISOString(),
    type: "custom",
    customType: "uix.turn-state",
    data: { state },
  } as unknown as SessionEntry;
}

function createManager(branch: readonly SessionEntry[]): {
  manager: SessionManager;
  appendCustomEntry: Mock;
} {
  const appendCustomEntry = vi.fn(() => "entry-id");
  return {
    manager: {
      getBranch: () => branch,
      getHeader: () => ({ cwd: "/workspace" }),
      getCwd: () => "/workspace",
      appendCustomEntry,
    } as unknown as SessionManager,
    appendCustomEntry,
  };
}

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe("turn-state coordinator", () => {
  it("restores the selected branch before allowing an active-state commit", async () => {
    const registry = new TurnStateRegistry();
    const restore = vi.fn();
    registerTurnStateContributions(registry, "canvas", {
      documents: {
        schema: Type.String(),
        createSnapshot: () => "live",
        restore,
      },
    });
    const { manager, appendCustomEntry } = createManager([
      turnStateEntry({ "canvas.documents": "persisted" }),
    ]);
    using coordinator = createTurnStateCoordinator({
      registry,
      cwd: "/workspace",
    });

    await expect(coordinator.commitIfReady(manager)).resolves.toBe(false);

    await coordinator.restoreCurrent(manager);

    expect(restore).toHaveBeenCalledWith("persisted");
    expect(coordinator.isRestorationSettled(manager)).toBe(true);
    await expect(coordinator.commitIfReady(manager)).resolves.toBe(true);
    expect(appendCustomEntry).toHaveBeenCalledWith("uix.turn-state", {
      cwd: "/workspace",
      state: { "canvas.documents": "live" },
    });
  });

  it("skips an obsolete registry snapshot and restores current cells", async () => {
    const registry = new TurnStateRegistry();
    const restorePreviousInstance = vi.fn();
    const previousCellsDisposable = registerTurnStateContributions(
      registry,
      "canvas",
      {
        documents: {
          schema: Type.String(),
          createSnapshot: () => "previous",
          restore: restorePreviousInstance,
        },
      },
    );
    const { manager } = createManager([
      turnStateEntry({ "canvas.documents": "persisted" }),
    ]);
    using coordinator = createTurnStateCoordinator({
      registry,
      cwd: "/workspace",
    });
    const obsoleteSnapshot = coordinator.toRegistrySnapshot();

    previousCellsDisposable[Symbol.dispose]();
    const restoreReplacementInstance = vi.fn();
    registerTurnStateContributions(registry, "canvas", {
      documents: {
        schema: Type.String(),
        createSnapshot: () => "replacement",
        restore: restoreReplacementInstance,
      },
    });

    await expect(coordinator.restore(manager, obsoleteSnapshot)).resolves.toBe(
      false,
    );
    expect(restorePreviousInstance).not.toHaveBeenCalled();
    expect(restoreReplacementInstance).not.toHaveBeenCalled();

    await coordinator.restoreCurrent(manager);
    expect(restoreReplacementInstance).toHaveBeenCalledWith("persisted");
  });

  it("shares restoration for equivalent registry snapshots", async () => {
    const registry = new TurnStateRegistry();
    const restoreGate = deferred();
    const restore = vi.fn(async () => restoreGate.promise);
    registerTurnStateContributions(registry, "canvas", {
      documents: {
        schema: Type.String(),
        createSnapshot: () => "live",
        restore,
      },
    });
    const { manager } = createManager([
      turnStateEntry({ "canvas.documents": "persisted" }),
    ]);
    using coordinator = createTurnStateCoordinator({
      registry,
      cwd: "/workspace",
    });

    const firstRestoration = coordinator.restore(
      manager,
      coordinator.toRegistrySnapshot(),
    );
    const secondRestoration = coordinator.restore(
      manager,
      coordinator.toRegistrySnapshot(),
    );

    expect(secondRestoration).toBe(firstRestoration);
    expect(restore).toHaveBeenCalledOnce();

    restoreGate.resolve();
    await expect(firstRestoration).resolves.toBe(true);
  });
});
