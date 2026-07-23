import type {
  SessionEntry,
  SessionManager,
} from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { describe, expect, it, vi } from "vitest";

import {
  registerTurnStateContributions,
  TurnStateRegistry,
} from "../turn-state/registry";
import { createTurnStateLifecycle } from "./turn-state-lifecycle";

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

function createManager(branch: readonly SessionEntry[]) {
  const appendCustomEntry = vi.fn(() => "entry-id");
  return {
    manager: {
      getBranch: () => branch,
      appendCustomEntry,
    } as unknown as SessionManager,
    appendCustomEntry,
  };
}

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe("agent turn-state lifecycle", () => {
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
    using lifecycle = createTurnStateLifecycle({
      registry,
      cwd: "/workspace",
    });

    await expect(lifecycle.commitIfReady(manager)).resolves.toBe(false);

    await lifecycle.restoreCurrent(manager);

    expect(restore).toHaveBeenCalledWith("persisted");
    expect(lifecycle.isRestorationSettled(manager)).toBe(true);
    await expect(lifecycle.commitIfReady(manager)).resolves.toBe(true);
    expect(appendCustomEntry).toHaveBeenCalledWith("uix.turn-state", {
      cwd: "/workspace",
      state: { "canvas.documents": "live" },
    });
  });

  it("skips an obsolete registry snapshot and restores current registrations", async () => {
    const registry = new TurnStateRegistry();
    const restorePreviousInstance = vi.fn();
    const previousRegistration = registerTurnStateContributions(
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
    using lifecycle = createTurnStateLifecycle({
      registry,
      cwd: "/workspace",
    });
    const obsoleteSnapshot = lifecycle.toRegistrySnapshot();

    previousRegistration[Symbol.dispose]();
    const restoreReplacementInstance = vi.fn();
    registerTurnStateContributions(registry, "canvas", {
      documents: {
        schema: Type.String(),
        createSnapshot: () => "replacement",
        restore: restoreReplacementInstance,
      },
    });

    await expect(lifecycle.restore(manager, obsoleteSnapshot)).resolves.toBe(
      false,
    );
    expect(restorePreviousInstance).not.toHaveBeenCalled();
    expect(restoreReplacementInstance).not.toHaveBeenCalled();

    await lifecycle.restoreCurrent(manager);
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
    using lifecycle = createTurnStateLifecycle({
      registry,
      cwd: "/workspace",
    });

    const firstRestoration = lifecycle.restore(
      manager,
      lifecycle.toRegistrySnapshot(),
    );
    const secondRestoration = lifecycle.restore(
      manager,
      lifecycle.toRegistrySnapshot(),
    );

    expect(secondRestoration).toBe(firstRestoration);
    expect(restore).toHaveBeenCalledOnce();

    restoreGate.resolve();
    await expect(firstRestoration).resolves.toBe(true);
  });
});
