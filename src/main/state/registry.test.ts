import { describe, expect, it } from "vitest";

import type {
  ExtensionAPI,
  ExtensionContext,
} from "@earendil-works/pi-coding-agent";

import { createStateCoordinator, createStateRegistry } from "./registry";

type VoidHandler = (event: unknown, ctx: ExtensionContext) => Promise<void>;

function setupCoordinator(state = createStateRegistry()) {
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

  void createStateCoordinator(state)(pi);

  const fire = async (event: string, cwd = "/work") => {
    for (const handler of handlers.get(event) ?? []) {
      await handler({}, { cwd } as ExtensionContext);
    }
  };

  return { entries, fire };
}

describe("StateRegistry", () => {
  it("rejects duplicate contribution ids", () => {
    const state = createStateRegistry();

    state.register({ id: "canvas" });

    expect(() => state.register({ id: "canvas" })).toThrow(
      "State contribution already registered: canvas",
    );
  });

  it("unregisters contributions when disposed", async () => {
    const state = createStateRegistry();
    const contribution = state.register({
      id: "canvas",
      prepareUserSubmitState: () => ({ state: { main: "v1" } }),
    });
    const { entries, fire } = setupCoordinator(state);

    contribution[Symbol.dispose]();
    state.register({ id: "canvas" });

    await fire("input");

    expect(entries).toEqual([]);
  });

  it("aggregates user-submit state by contribution id", async () => {
    const state = createStateRegistry();
    state.register({
      id: "canvas",
      prepareUserSubmitState: () => ({
        state: { "doc://canvas/main": "v1" },
      }),
    });
    state.register({
      id: "chat",
      prepareUserSubmitState: () =>
        Promise.resolve({ state: { selected: "c1" } }),
    });
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

  it("aggregates agent-end state by contribution id", async () => {
    const state = createStateRegistry();
    state.register({
      id: "canvas",
      prepareAgentEndState: () => ({
        state: { "doc://canvas/main": "v2" },
      }),
    });
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
    const state = createStateRegistry();
    state.register({
      id: "canvas",
      prepareUserSubmitState: () => undefined,
    });
    state.register({
      id: "chat",
      prepareUserSubmitState: () => ({ state: { selected: "c1" } }),
    });
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
    const state = createStateRegistry();
    state.register({
      id: "canvas",
      prepareUserSubmitState: () => undefined,
    });
    const { entries, fire } = setupCoordinator(state);

    await fire("input");

    expect(entries).toEqual([]);
  });
});
