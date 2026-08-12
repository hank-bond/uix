import type {
  AgentSessionRuntime,
  SessionManager,
} from "@earendil-works/pi-coding-agent";
import { describe, expect, it, vi } from "vitest";

import { type AgentInstanceOptions, createAgentInstance } from "./instance";
import type { AgentInstanceState } from "./instance-state";
import { toBranchId, toSessionId } from "../workspace";

interface Harness {
  manager: SessionManager;
  runtime: AgentSessionRuntime;
  runtimeDispose: ReturnType<typeof vi.fn<() => Promise<void>>>;
  openManager: ReturnType<typeof vi.fn<AgentInstanceOptions["openManager"]>>;
  createRuntime: ReturnType<
    typeof vi.fn<AgentInstanceOptions["createRuntime"]>
  >;
  target: {
    sessionId: ReturnType<typeof toSessionId>;
    branchId: ReturnType<typeof toBranchId>;
  };
}

function createHarness(): Harness {
  const manager = {} as SessionManager;
  const runtimeDispose = vi.fn<() => Promise<void>>(() => Promise.resolve());
  const runtime = {
    dispose: runtimeDispose,
  } as unknown as AgentSessionRuntime;
  const openManager = vi.fn<AgentInstanceOptions["openManager"]>(() =>
    Promise.resolve(manager),
  );
  const createRuntime = vi.fn<AgentInstanceOptions["createRuntime"]>(() =>
    Promise.resolve(runtime),
  );
  const target = {
    sessionId: toSessionId("session-1"),
    branchId: toBranchId("entry-1"),
  };
  return {
    manager,
    runtime,
    runtimeDispose,
    openManager,
    createRuntime,
    target,
  };
}

describe("AgentInstance", () => {
  it("owns one manager, runtime, and mutable state for a fixed target", async () => {
    const harness = createHarness();
    const instance = await createAgentInstance({
      target: harness.target,
      openManager: harness.openManager,
      createRuntime: harness.createRuntime,
      state: { emit: () => undefined, cwd: "/workspace" },
    });

    expect(harness.openManager).toHaveBeenCalledWith(harness.target);
    expect(harness.createRuntime).toHaveBeenCalledWith(
      harness.manager,
      instance.state,
    );
    expect(instance.target).toBe(harness.target);
    expect(instance.manager).toBe(harness.manager);
    expect(instance.runtime).toBe(harness.runtime);
    expect(instance.state.ephemeralTranscriptIds.next("assistant")).toBe(
      "live:assistant:1",
    );

    await Promise.all([instance.dispose(), instance.dispose()]);
    expect(harness.runtimeDispose).toHaveBeenCalledOnce();
    expect(() => {
      instance.state.setCurrentModel(undefined);
    }).toThrow("disposed");
  });

  it("disposes instance state when manager boot fails", async () => {
    const harness = createHarness();
    let capturedState: AgentInstanceState | undefined;
    harness.openManager.mockRejectedValue(new Error("manager failed"));
    harness.createRuntime.mockImplementation((_manager, state) => {
      capturedState = state;
      return Promise.resolve(harness.runtime);
    });

    await expect(
      createAgentInstance({
        target: harness.target,
        openManager: harness.openManager,
        createRuntime: harness.createRuntime,
        state: { emit: () => undefined, cwd: "/workspace" },
      }),
    ).rejects.toThrow("manager failed");
    expect(capturedState).toBeUndefined();
    expect(harness.runtimeDispose).not.toHaveBeenCalled();
  });

  it("disposes instance state when runtime boot fails", async () => {
    const harness = createHarness();
    let capturedState: AgentInstanceState | undefined;
    harness.createRuntime.mockImplementation((_manager, state) => {
      capturedState = state;
      return Promise.reject(new Error("runtime failed"));
    });

    await expect(
      createAgentInstance({
        target: harness.target,
        openManager: harness.openManager,
        createRuntime: harness.createRuntime,
        state: { emit: () => undefined, cwd: "/workspace" },
      }),
    ).rejects.toThrow("runtime failed");
    expect(() => capturedState?.setCurrentModel(undefined)).toThrow("disposed");
    expect(harness.runtimeDispose).not.toHaveBeenCalled();
  });
});
