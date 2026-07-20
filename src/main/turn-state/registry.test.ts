import { describe, expect, it } from "vitest";

import type {
  ExtensionAPI,
  ExtensionContext,
  SessionEntry,
  SessionManager,
} from "@earendil-works/pi-coding-agent";
import { Codec, Type } from "typebox";

import type { TurnStateContributions } from "@uix/api/turn-state";

import {
  toTurnStateRegistrySnapshot,
  createTurnStateCoordinator,
  createTurnStateHistoryReader,
  createTurnStateProjector,
  isSameTurnStateRegistrySnapshot,
  isTurnStateRegistrySnapshotCurrent,
  registerTurnStateContributions,
  restoreTurnStateCellsAsOfLeaf,
  commitCurrentTurnState,
  TurnStateRegistry,
} from "./registry";

type VoidHandler = (event: unknown, ctx: ExtensionContext) => Promise<void>;

function cells(
  createSnapshot: () => unknown = () => ({ main: "v1" }),
): TurnStateContributions {
  return {
    documents: {
      schema: Type.Record(Type.String(), Type.String()),
      createSnapshot,
      restore: () => undefined,
    },
  };
}

function turnStateEntry(
  id: string,
  data: { cwd?: string; state: Record<string, unknown> },
): SessionEntry {
  return {
    id,
    parentId: undefined,
    timestamp: new Date(0).toISOString(),
    type: "custom",
    customType: "uix.turn-state",
    data,
  } as unknown as SessionEntry;
}

function setupCoordinator(state = new TurnStateRegistry()) {
  const handlers = new Map<string, VoidHandler[]>();
  const entries: Array<{ customType: string; data: unknown }> = [];

  const pi = {
    on: (event: string, handler: VoidHandler) => {
      handlers.set(event, [...(handlers.get(event) ?? []), handler]);
    },
    appendEntry: (customType: string, data: unknown) => {
      entries.push({ customType, data });
    },
  } as unknown as ExtensionAPI;

  void createTurnStateCoordinator(state)(pi);

  const fire = async (
    event: string,
    cwd = "/work",
    branch: readonly SessionEntry[] = [],
  ) => {
    for (const handler of handlers.get(event) ?? []) {
      await handler({}, {
        cwd,
        sessionManager: { getBranch: () => branch },
      } as unknown as ExtensionContext);
    }
  };

  const submit = async (
    cwd = "/work",
    branch: readonly SessionEntry[] = [],
  ) => {
    const manager = {
      appendCustomEntry: (customType: string, data: unknown) => {
        entries.push({ customType, data });
        return "entry-id";
      },
      getBranch: () => branch,
    } as SessionManager;
    await commitCurrentTurnState(manager, cwd, state);
  };

  return { entries, fire, submit };
}

function projectTurnState(
  state: TurnStateRegistry,
  values: Record<string, unknown>,
) {
  const projector = createTurnStateProjector(state);
  projector.projectEntry(turnStateEntry("projected", { state: values }));
  return projector.deriveAsOfLeaf();
}

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe("TurnStateRegistry", () => {
  it("derives one independently registered id per named cell", () => {
    const state = new TurnStateRegistry();
    const registration = registerTurnStateContributions(state, "canvas", {
      ...cells(),
      selection: {
        schema: Type.Object({ anchor: Type.String() }),
        createSnapshot: () => ({ anchor: "a1" }),
        restore: () => undefined,
      },
    });

    expect(
      state.registrations.map((registration) => registration.canonicalId),
    ).toEqual(["canvas.documents", "canvas.selection"]);

    expect(() =>
      registerTurnStateContributions(state, "canvas", cells()),
    ).toThrow("Turn state already registered: canvas.documents");

    registration[Symbol.dispose]();
    expect(state.registrations).toEqual([]);
  });

  it("recognizes when reload replaces a turn-state registry snapshot", () => {
    const state = new TurnStateRegistry();
    const registration = registerTurnStateContributions(
      state,
      "canvas",
      cells(),
    );
    const snapshot = toTurnStateRegistrySnapshot(state);
    const equivalentSnapshot = toTurnStateRegistrySnapshot(state);

    expect(isSameTurnStateRegistrySnapshot(snapshot, equivalentSnapshot)).toBe(
      true,
    );
    expect(isTurnStateRegistrySnapshotCurrent(state, snapshot)).toBe(true);

    registration[Symbol.dispose]();
    registerTurnStateContributions(state, "canvas", cells());
    expect(isTurnStateRegistrySnapshotCurrent(state, snapshot)).toBe(false);
    expect(
      isSameTurnStateRegistrySnapshot(
        snapshot,
        toTurnStateRegistrySnapshot(state),
      ),
    ).toBe(false);
  });

  it("rejects TypeBox codecs anywhere in a cell schema", () => {
    const state = new TurnStateRegistry();
    const encodedNumber = Codec(Type.String())
      .Decode((value) => Number(value))
      .Encode((value) => String(value));

    expect(() =>
      registerTurnStateContributions(state, "canvas", {
        selection: {
          schema: Type.Object({ index: encodedNumber }),
          createSnapshot: () => ({ index: 1 }),
          restore: () => undefined,
        },
      }),
    ).toThrow(
      "Invalid turn-state schema for canvas.selection: codecs are not supported",
    );
  });

  it("persists changed cells under their feature-and-cell ids", async () => {
    const state = new TurnStateRegistry();
    registerTurnStateContributions(state, "canvas", {
      documents: {
        schema: Type.Record(Type.String(), Type.String()),
        createSnapshot: () => ({ main: "v1" }),
        restore: () => undefined,
      },
      selection: {
        schema: Type.Object({ anchor: Type.String() }),
        createSnapshot: () => Promise.resolve({ anchor: "a1" }),
        restore: () => undefined,
      },
    });
    registerTurnStateContributions(state, "chat", {
      draft: {
        schema: Type.String(),
        createSnapshot: () => "hello",
        restore: () => undefined,
      },
    });
    const { entries, submit } = setupCoordinator(state);

    await submit("/repo");

    expect(entries).toEqual([
      {
        customType: "uix.turn-state",
        data: {
          cwd: "/repo",
          state: {
            "canvas.documents": { main: "v1" },
            "canvas.selection": { anchor: "a1" },
            "chat.draft": "hello",
          },
        },
      },
    ]);
  });

  it("suppresses each unchanged cell without suppressing changed siblings", async () => {
    const state = new TurnStateRegistry();
    registerTurnStateContributions(state, "canvas", {
      documents: {
        schema: Type.Record(Type.String(), Type.String()),
        createSnapshot: () => ({ main: "v1" }),
        restore: () => undefined,
      },
      selection: {
        schema: Type.Object({ anchor: Type.String() }),
        createSnapshot: () => ({ anchor: "a2" }),
        restore: () => undefined,
      },
    });
    const branch = [
      turnStateEntry("previous", {
        state: {
          "canvas.documents": { main: "v1" },
          "canvas.selection": { anchor: "a1" },
        },
      }),
    ];
    const { entries, submit } = setupCoordinator(state);

    await submit("/repo", branch);

    expect(entries).toEqual([
      {
        customType: "uix.turn-state",
        data: {
          cwd: "/repo",
          state: { "canvas.selection": { anchor: "a2" } },
        },
      },
    ]);
  });

  it("does not append when every cell is unchanged", async () => {
    const state = new TurnStateRegistry();
    registerTurnStateContributions(state, "canvas", cells());
    const branch = [
      turnStateEntry("previous", {
        cwd: "/repo",
        state: { "canvas.documents": { main: "v1" } },
      }),
    ];
    const { entries, submit } = setupCoordinator(state);

    await submit("/repo", branch);

    expect(entries).toEqual([]);
  });

  it("persists a cwd change without re-persisting unchanged cells", async () => {
    const state = new TurnStateRegistry();
    registerTurnStateContributions(state, "canvas", cells());
    const branch = [
      turnStateEntry("previous", {
        cwd: "/old",
        state: { "canvas.documents": { main: "v1" } },
      }),
    ];
    const { entries, submit } = setupCoordinator(state);

    await submit("/new", branch);

    expect(entries).toEqual([
      {
        customType: "uix.turn-state",
        data: { cwd: "/new", state: {} },
      },
    ]);
  });

  it("validates snapshot output against the cell schema", async () => {
    const state = new TurnStateRegistry();
    registerTurnStateContributions(
      state,
      "canvas",
      cells(() => ({ main: 1 })),
    );
    const { submit } = setupCoordinator(state);

    await expect(submit()).rejects.toThrow(
      "Invalid turn-state snapshot for canvas.documents: value does not match its schema",
    );
  });

  it("rejects snapshot output that is not plain JSON", async () => {
    const state = new TurnStateRegistry();
    registerTurnStateContributions(
      state,
      "canvas",
      cells(() => new Date(0)),
    );
    const { submit } = setupCoordinator(state);

    await expect(submit()).rejects.toThrow(
      "Invalid turn-state snapshot for canvas.documents: value must be plain JSON",
    );
  });

  it("commits the same reason-free cell snapshots at agent end", async () => {
    const state = new TurnStateRegistry();
    registerTurnStateContributions(state, "canvas", cells());
    const { entries, fire } = setupCoordinator(state);

    await fire("agent_end");

    expect(entries).toEqual([
      {
        customType: "uix.turn-state",
        data: {
          cwd: "/work",
          state: { "canvas.documents": { main: "v1" } },
        },
      },
    ]);
  });

  it("validates projected values before restoring any cell in their feature", async () => {
    const state = new TurnStateRegistry();
    const restored: string[] = [];
    registerTurnStateContributions(state, "canvas", {
      documents: {
        schema: Type.String(),
        createSnapshot: () => "",
        restore: () => {
          restored.push("canvas.documents");
        },
      },
      selection: {
        schema: Type.String(),
        createSnapshot: () => "",
        restore: () => {
          restored.push("canvas.selection");
        },
      },
    });
    registerTurnStateContributions(state, "chat", {
      draft: {
        schema: Type.String(),
        createSnapshot: () => "",
        restore: () => {
          restored.push("chat.draft");
        },
      },
    });

    const result = await restoreTurnStateCellsAsOfLeaf(
      state,
      projectTurnState(state, {
        "canvas.documents": "version-1",
        "canvas.selection": 42,
        "chat.draft": "hello",
      }),
    );

    expect(restored).toEqual(["chat.draft"]);
    expect(result.failures).toHaveLength(1);
    expect(result.failures[0]).toMatchObject({
      featureId: "canvas",
      cellName: "selection",
      phase: "validation",
    });
    expect(result.failures[0]?.error.message).toBe(
      "Invalid persisted turn-state value for canvas.selection: value does not match its schema",
    );
  });

  it("restores features concurrently and each feature's cells sequentially", async () => {
    const state = new TurnStateRegistry();
    const documentGate = deferred();
    const restored: Array<[string, unknown]> = [];
    registerTurnStateContributions(state, "canvas", {
      documents: {
        schema: Type.String(),
        createSnapshot: () => "",
        restore: async (value) => {
          restored.push(["canvas.documents", value]);
          await documentGate.promise;
        },
      },
      selection: {
        schema: Type.String(),
        createSnapshot: () => "",
        restore: (value) => {
          restored.push(["canvas.selection", value]);
        },
      },
    });
    registerTurnStateContributions(state, "chat", {
      draft: {
        schema: Type.String(),
        createSnapshot: () => "",
        restore: (value) => {
          restored.push(["chat.draft", value]);
        },
      },
    });

    const restoration = restoreTurnStateCellsAsOfLeaf(
      state,
      projectTurnState(state, {
        "canvas.documents": "version-1",
        "chat.draft": "hello",
      }),
    );

    expect(restored).toEqual([
      ["canvas.documents", "version-1"],
      ["chat.draft", "hello"],
    ]);

    documentGate.resolve();
    await expect(restoration).resolves.toEqual({ failures: [] });
    expect(restored).toEqual([
      ["canvas.documents", "version-1"],
      ["chat.draft", "hello"],
      ["canvas.selection", undefined],
    ]);
  });

  it("stops a failed feature without blocking sibling restoration", async () => {
    const state = new TurnStateRegistry();
    const restored: string[] = [];
    registerTurnStateContributions(state, "canvas", {
      documents: {
        schema: Type.String(),
        createSnapshot: () => "",
        restore: () => {
          throw new Error("document restore failed");
        },
      },
      selection: {
        schema: Type.String(),
        createSnapshot: () => "",
        restore: () => {
          restored.push("canvas.selection");
        },
      },
    });
    registerTurnStateContributions(state, "chat", {
      draft: {
        schema: Type.String(),
        createSnapshot: () => "",
        restore: () => {
          restored.push("chat.draft");
        },
      },
    });

    const result = await restoreTurnStateCellsAsOfLeaf(
      state,
      projectTurnState(state, {
        "canvas.documents": "version-1",
        "canvas.selection": "anchor-1",
        "chat.draft": "hello",
      }),
    );

    expect(restored).toEqual(["chat.draft"]);
    expect(result.failures).toHaveLength(1);
    expect(result.failures[0]).toMatchObject({
      featureId: "canvas",
      cellName: "documents",
      phase: "restore",
      error: new Error("document restore failed"),
    });
  });

  it("reads one cell's history without sibling commits", () => {
    const branch = [
      turnStateEntry("older", {
        cwd: "/old",
        state: {
          "canvas.documents": { main: "v1" },
          "canvas.selection": { anchor: "a1" },
        },
      }),
      turnStateEntry("selection-only", {
        state: { "canvas.selection": { anchor: "a2" } },
      }),
      turnStateEntry("newer", {
        cwd: "/new",
        state: { "canvas.documents": { main: "v2" } },
      }),
    ];
    const reader = createTurnStateHistoryReader(branch, "canvas");

    expect(reader.turnState("documents")).toEqual({
      entryId: "newer",
      cwd: "/new",
      state: { main: "v2" },
    });
    expect(reader.turnStates("documents", { offset: 1, limit: 1 })).toEqual([
      {
        entryId: "older",
        cwd: "/old",
        state: { main: "v1" },
      },
    ]);
  });
});
