import { describe, expect, it } from "vitest";

import type {
  ExtensionAPI,
  ExtensionContext,
  SessionEntry,
  SessionManager,
} from "@earendil-works/pi-coding-agent";

import {
  createTurnStateCoordinator,
  registerTurnStateContributions,
  submitTurnStatePrep,
  TurnStateRegistry,
} from "./registry";

type VoidHandler = (event: unknown, ctx: ExtensionContext) => Promise<void>;

function register(state: TurnStateRegistry, featureId: string) {
  return registerTurnStateContributions(state, featureId, [
    {
      prepareUserSubmitState: () => ({ state: { main: "v1" } }),
    },
  ]);
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
  const sessionManager = {
    appendCustomEntry: (customType: string, data: unknown) => {
      entries.push({ customType, data });
      return "entry-id";
    },
    getBranch: () => [] as readonly SessionEntry[],
  } as SessionManager;

  const pi = {
    on: (event: string, handler: VoidHandler) => {
      handlers.set(event, [...(handlers.get(event) ?? []), handler]);
    },
  } as unknown as ExtensionAPI;

  void createTurnStateCoordinator(state)(pi);

  const fire = async (
    event: string,
    cwd = "/work",
    branch: readonly SessionEntry[] = [],
  ) => {
    const branchArr = [...branch];
    for (const handler of handlers.get(event) ?? []) {
      await handler({}, {
        cwd,
        sessionManager: {
          getBranch: () => branchArr,
          appendCustomEntry: (customType: string, data: unknown) => {
            entries.push({ customType, data });
            return "entry-id";
          },
        },
      } as ExtensionContext);
    }
  };

  const submit = async (
    cwd = "/work",
    branch: readonly SessionEntry[] = [],
  ) => {
    const mgr = {
      appendCustomEntry: (customType: string, data: unknown) => {
        entries.push({ customType, data });
        return "entry-id";
      },
      getBranch: () => branch,
    } as SessionManager;
    await submitTurnStatePrep(mgr, cwd, state);
  };

  return { entries, fire, submit };
}

describe("TurnStateRegistry", () => {
  it("rejects duplicate contribution ids", () => {
    const state = new TurnStateRegistry();

    registerTurnStateContributions(state, "canvas", [{}]);

    expect(() => registerTurnStateContributions(state, "canvas", [{}])).toThrow(
      "Turn state already registered: canvas",
    );
  });

  it("rejects more than one contribution per feature", () => {
    const state = new TurnStateRegistry();

    expect(() =>
      registerTurnStateContributions(state, "canvas", [{}, {}]),
    ).toThrow(
      "Feature canvas contributes more than one turn-state contribution. This is a singleton facet: at most one per feature.",
    );
  });

  it("unregisters contributions when disposed", async () => {
    const state = new TurnStateRegistry();
    const disposable = register(state, "canvas");
    const { entries, submit } = setupCoordinator(state);

    disposable[Symbol.dispose]();
    // submit() reads the live registry; the disposed contribution is gone, so
    // no entry is produced.
    await submit();
    expect(entries).toEqual([]);

    // Re-register a new contribution — it is live in the registry and fires.
    register(state, "canvas");
    await submit();
    expect(entries).toEqual([
      {
        customType: "uix.turn-state",
        data: { cwd: "/work", state: { canvas: { main: "v1" } } },
      },
    ]);
  });

  it("bulk-registers contributions and disposes them together", async () => {
    const state = new TurnStateRegistry();
    const registrations = registerTurnStateContributions(state, "canvas", [
      {
        prepareUserSubmitState: () => ({ state: { main: "v1" } }),
      },
    ]);
    const { entries, submit } = setupCoordinator(state);

    await submit();
    expect(entries).toEqual([
      {
        customType: "uix.turn-state",
        data: {
          cwd: "/work",
          state: { canvas: { main: "v1" } },
        },
      },
    ]);

    registrations[Symbol.dispose]();
    await submit();
    expect(entries).toHaveLength(1);
  });

  it("provides contribution-scoped previous turn-state helpers", async () => {
    const state = new TurnStateRegistry();
    const branch = [
      turnStateEntry("older", {
        cwd: "/old",
        state: { canvas: { main: "v1" }, chat: { selected: "c1" } },
      }),
      turnStateEntry("chat-only", {
        cwd: "/chat",
        state: { chat: { selected: "c2" } },
      }),
      turnStateEntry("newer", {
        cwd: "/new",
        state: { canvas: { main: "v2" } },
      }),
    ];
    let previous: { main: string } | undefined;
    let secondPrevious: { main: string } | undefined;
    registerTurnStateContributions(state, "canvas", [
      {
        prepareUserSubmitState: (ctx) => {
          previous = ctx.turnState<{ main: string }>()?.state;
          secondPrevious = ctx.turnStates<{ main: string }>({
            offset: 1,
            limit: 1,
          })[0]?.state;
          return { state: { main: ctx.cwd } };
        },
      },
    ]);
    const { entries, submit } = setupCoordinator(state);

    await submit("/repo", branch);

    expect(previous).toEqual({ main: "v2" });
    expect(secondPrevious).toEqual({ main: "v1" });
    expect(entries).toEqual([
      {
        customType: "uix.turn-state",
        data: { cwd: "/repo", state: { canvas: { main: "/repo" } } },
      },
    ]);
  });

  it("aggregates user-submit state by feature id", async () => {
    const state = new TurnStateRegistry();
    registerTurnStateContributions(state, "canvas", [
      {
        prepareUserSubmitState: () => ({
          state: { "doc://canvas/main": "v1" },
        }),
      },
    ]);
    registerTurnStateContributions(state, "chat", [
      {
        prepareUserSubmitState: () =>
          Promise.resolve({ state: { selected: "c1" } }),
      },
    ]);
    const { entries, submit } = setupCoordinator(state);

    await submit("/repo");

    expect(entries).toEqual([
      {
        customType: "uix.turn-state",
        data: {
          cwd: "/repo",
          state: {
            canvas: { "doc://canvas/main": "v1" },
            chat: { selected: "c1" },
          },
        },
      },
    ]);
  });

  it("aggregates agent-end state by feature id", async () => {
    const state = new TurnStateRegistry();
    registerTurnStateContributions(state, "canvas", [
      {
        prepareAgentEndState: () => ({
          state: { "doc://canvas/main": "v2" },
        }),
      },
    ]);
    const { entries, fire } = setupCoordinator(state);

    await fire("agent_end");

    expect(entries).toEqual([
      {
        customType: "uix.turn-state",
        data: {
          cwd: "/work",
          state: { canvas: { "doc://canvas/main": "v2" } },
        },
      },
    ]);
  });

  it("skips contributions that do not prepare state", async () => {
    const state = new TurnStateRegistry();
    registerTurnStateContributions(state, "canvas", [
      {
        prepareUserSubmitState: () => undefined,
      },
    ]);
    registerTurnStateContributions(state, "chat", [
      {
        prepareUserSubmitState: () => ({ state: { selected: "c1" } }),
      },
    ]);
    const { entries, submit } = setupCoordinator(state);

    await submit();

    expect(entries).toEqual([
      {
        customType: "uix.turn-state",
        data: { cwd: "/work", state: { chat: { selected: "c1" } } },
      },
    ]);
  });

  it("does not append a turn-state entry when nothing prepares state", async () => {
    const state = new TurnStateRegistry();
    registerTurnStateContributions(state, "canvas", [
      {
        prepareUserSubmitState: () => undefined,
      },
    ]);
    const { entries, submit } = setupCoordinator(state);

    await submit();

    expect(entries).toEqual([]);
  });
});
