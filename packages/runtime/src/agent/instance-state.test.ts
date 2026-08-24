import type {
  ExtensionAPI,
  SessionManager,
} from "@earendil-works/pi-coding-agent";
import { describe, expect, it } from "vitest";

import { createAgentInstanceState } from "./instance-state";
import { TurnStateRegistry } from "../turn-state";

function createPiHarness(): {
  pi: ExtensionAPI;
  selectModel(provider: string, id: string): void;
} {
  let modelSelect:
    | ((event: { model: { provider: string; id: string } }) => void)
    | undefined;
  return {
    pi: {
      on(event: string, handler: typeof modelSelect) {
        if (event === "model_select") modelSelect = handler;
      },
    } as unknown as ExtensionAPI,
    selectModel(provider, id) {
      modelSelect?.({ model: { provider, id } });
    },
  };
}

function createManager(): SessionManager {
  return {
    getBranch: () => [],
    getHeader: () => ({ cwd: "/workspace" }),
    getCwd: () => "/workspace",
  } as unknown as SessionManager;
}

function createState(turnState = new TurnStateRegistry()): AgentInstanceState {
  return createAgentInstanceState({
    emit: () => undefined,
    initialTranscript: { items: [] },
    turnState,
    cwd: "/workspace",
  });
}

type AgentInstanceState = ReturnType<typeof createAgentInstanceState>;

describe("agent instance state", () => {
  it("isolates mutable projections and restoration coordination per instance", async () => {
    using first = createState();
    using second = createState();
    const firstPi = createPiHarness();
    const secondPi = createPiHarness();
    await first.modelInstaller(firstPi.pi);
    await second.modelInstaller(secondPi.pi);

    firstPi.selectModel("anthropic", "claude");

    expect(first.getCurrentModel()).toEqual({
      provider: "anthropic",
      id: "claude",
    });
    expect(second.getCurrentModel()).toBeUndefined();

    expect(first.ephemeralTranscriptIds.next("assistant")).toBe(
      "live:assistant:1",
    );
    expect(first.ephemeralTranscriptIds.next("tool")).toBe("live:tool:2");
    expect(second.ephemeralTranscriptIds.next("error")).toBe("live:error:1");

    const manager = createManager();
    await first.turnStateCoordinator?.restoreCurrent(manager);
    expect(first.turnStateCoordinator?.isRestorationSettled(manager)).toBe(
      true,
    );
    expect(second.turnStateCoordinator?.isRestorationSettled(manager)).toBe(
      false,
    );
  });
});
