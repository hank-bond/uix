import { describe, expect, it } from "vitest";

import type {
  ExtensionAPI,
  ExtensionContext,
} from "@earendil-works/pi-coding-agent";

import {
  createTurnStateCoordinator,
  registerTurnStateContributions,
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

function setupCoordinator(state = new TurnStateRegistry()) {
  const handlers = new Map<string, VoidHandler[]>();
  const entries: Array<{ customType: string; data: unknown }> = [];
  const pi = {
    appendEntry: (customType: string, data: unknown) => {
      entries.push({ customType, data });
    },
    on: (event: string, handler: VoidHandler) => {
      handlers.set(event, [...(handlers.get(event) ?? []), handler]);
    },
  } as unknown as ExtensionAPI;

  void createTurnStateCoordinator(state)(pi);

  const fire = async (event: string, cwd = "/work") => {
    for (const handler of handlers.get(event) ?? []) {
      await handler({}, { cwd } as ExtensionContext);
    }
  };

  return { entries, fire };
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
    const { entries, fire } = setupCoordinator(state);

    disposable[Symbol.dispose]();
    register(state, "canvas");

    await fire("input");

    expect(entries).toEqual([]);
  });

  it("bulk-registers contributions and disposes them together", async () => {
    const state = new TurnStateRegistry();
    const registrations = registerTurnStateContributions(state, "canvas", [
      {
        prepareUserSubmitState: () => ({ state: { main: "v1" } }),
      },
    ]);
    const { entries, fire } = setupCoordinator(state);

    await fire("input");
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
    await fire("input");
    expect(entries).toHaveLength(1);
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
    const { entries, fire } = setupCoordinator(state);

    await fire("input", "/repo");

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
    const { entries, fire } = setupCoordinator(state);

    await fire("input");

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
    const { entries, fire } = setupCoordinator(state);

    await fire("input");

    expect(entries).toEqual([]);
  });
});
