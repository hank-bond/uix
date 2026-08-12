import type {
  AgentSessionRuntime,
  SessionManager,
} from "@earendil-works/pi-coding-agent";
import { describe, expect, it, vi } from "vitest";

import { type AgentInstanceOptions, createAgentInstance } from "./instance";
import type { AgentInstanceState } from "./instance-state";
import { toSessionId } from "../workspace";

interface Harness {
  manager: SessionManager;
  runtime: AgentSessionRuntime;
  runtimeDispose: ReturnType<typeof vi.fn<() => Promise<void>>>;
  sessionReload: ReturnType<typeof vi.fn<() => Promise<void>>>;
  openManager: ReturnType<typeof vi.fn<AgentInstanceOptions["openManager"]>>;
  createRuntime: ReturnType<
    typeof vi.fn<AgentInstanceOptions["createRuntime"]>
  >;
  target: { sessionId: ReturnType<typeof toSessionId> };
}

function createHarness(): Harness {
  const manager = {} as SessionManager;
  const runtimeDispose = vi.fn<() => Promise<void>>(() => Promise.resolve());
  const sessionReload = vi.fn<() => Promise<void>>(() => Promise.resolve());
  const runtime = {
    session: { reload: sessionReload },
    dispose: runtimeDispose,
  } as unknown as AgentSessionRuntime;
  const openManager = vi.fn<AgentInstanceOptions["openManager"]>(() =>
    Promise.resolve(manager),
  );
  const createRuntime = vi.fn<AgentInstanceOptions["createRuntime"]>(() =>
    Promise.resolve(runtime),
  );
  return {
    manager,
    runtime,
    runtimeDispose,
    sessionReload,
    openManager,
    createRuntime,
    target: { sessionId: toSessionId("session-1") },
  };
}

describe("AgentInstance", () => {
  it("opens its manager without booting Pi until first use", async () => {
    const harness = createHarness();
    const instance = await createAgentInstance({
      target: harness.target,
      openManager: harness.openManager,
      createRuntime: harness.createRuntime,
      state: { emit: () => undefined, cwd: "/workspace" },
    });

    expect(harness.openManager).toHaveBeenCalledWith(harness.target);
    expect(harness.createRuntime).not.toHaveBeenCalled();
    expect(instance.target).toBe(harness.target);
    expect(instance.manager).toBe(harness.manager);

    await expect(instance.getRuntime()).resolves.toBe(harness.runtime);
    expect(harness.createRuntime).toHaveBeenCalledWith(
      harness.manager,
      instance.state,
    );
  });

  it("shares one runtime boot across concurrent callers", async () => {
    const harness = createHarness();
    let resolveRuntime!: (runtime: AgentSessionRuntime) => void;
    const runtimeGate = new Promise<AgentSessionRuntime>((resolve) => {
      resolveRuntime = resolve;
    });
    harness.createRuntime.mockReturnValue(runtimeGate);
    const instance = await createAgentInstance({
      target: harness.target,
      openManager: harness.openManager,
      createRuntime: harness.createRuntime,
      state: { emit: () => undefined, cwd: "/workspace" },
    });

    const first = instance.getRuntime();
    const second = instance.getRuntime();
    expect(second).toBe(first);
    expect(harness.createRuntime).toHaveBeenCalledOnce();

    resolveRuntime(harness.runtime);
    await expect(first).resolves.toBe(harness.runtime);
  });

  it("retries runtime boot after a failed attempt", async () => {
    const harness = createHarness();
    harness.createRuntime
      .mockRejectedValueOnce(new Error("runtime failed"))
      .mockResolvedValueOnce(harness.runtime);
    const instance = await createAgentInstance({
      target: harness.target,
      openManager: harness.openManager,
      createRuntime: harness.createRuntime,
      state: { emit: () => undefined, cwd: "/workspace" },
    });

    await expect(instance.getRuntime()).rejects.toThrow("runtime failed");
    await expect(instance.getRuntime()).resolves.toBe(harness.runtime);
    expect(harness.createRuntime).toHaveBeenCalledTimes(2);
  });

  it("does not boot an unused runtime merely to reload it", async () => {
    const harness = createHarness();
    const instance = await createAgentInstance({
      target: harness.target,
      openManager: harness.openManager,
      createRuntime: harness.createRuntime,
      state: { emit: () => undefined, cwd: "/workspace" },
    });

    await expect(instance.reloadRuntimeIfActive()).resolves.toBe(false);
    expect(harness.createRuntime).not.toHaveBeenCalled();
    expect(harness.sessionReload).not.toHaveBeenCalled();
  });

  it("reloads an active runtime", async () => {
    const harness = createHarness();
    const instance = await createAgentInstance({
      target: harness.target,
      openManager: harness.openManager,
      createRuntime: harness.createRuntime,
      state: { emit: () => undefined, cwd: "/workspace" },
    });
    await instance.getRuntime();

    await expect(instance.reloadRuntimeIfActive()).resolves.toBe(true);
    expect(harness.sessionReload).toHaveBeenCalledOnce();
  });

  it("awaits an existing runtime boot before reloading", async () => {
    const harness = createHarness();
    let resolveRuntime!: (runtime: AgentSessionRuntime) => void;
    const runtimeGate = new Promise<AgentSessionRuntime>((resolve) => {
      resolveRuntime = resolve;
    });
    harness.createRuntime.mockReturnValue(runtimeGate);
    const instance = await createAgentInstance({
      target: harness.target,
      openManager: harness.openManager,
      createRuntime: harness.createRuntime,
      state: { emit: () => undefined, cwd: "/workspace" },
    });

    void instance.getRuntime();
    const reload = instance.reloadRuntimeIfActive();
    resolveRuntime(harness.runtime);

    await expect(reload).resolves.toBe(true);
    expect(harness.createRuntime).toHaveBeenCalledOnce();
    expect(harness.sessionReload).toHaveBeenCalledOnce();
  });

  it("awaits and disposes a runtime that finishes booting during disposal", async () => {
    const harness = createHarness();
    let resolveRuntime!: (runtime: AgentSessionRuntime) => void;
    const runtimeGate = new Promise<AgentSessionRuntime>((resolve) => {
      resolveRuntime = resolve;
    });
    harness.createRuntime.mockReturnValue(runtimeGate);
    const instance = await createAgentInstance({
      target: harness.target,
      openManager: harness.openManager,
      createRuntime: harness.createRuntime,
      state: { emit: () => undefined, cwd: "/workspace" },
    });

    const boot = instance.getRuntime();
    const disposal = instance.dispose();
    resolveRuntime(harness.runtime);

    await expect(boot).rejects.toThrow("disposed");
    await disposal;
    expect(harness.runtimeDispose).toHaveBeenCalledOnce();
  });

  it("disposes its state and booted runtime idempotently", async () => {
    const harness = createHarness();
    const instance = await createAgentInstance({
      target: harness.target,
      openManager: harness.openManager,
      createRuntime: harness.createRuntime,
      state: { emit: () => undefined, cwd: "/workspace" },
    });
    await instance.getRuntime();

    await Promise.all([instance.dispose(), instance.dispose()]);
    expect(harness.runtimeDispose).toHaveBeenCalledOnce();
    await expect(instance.getRuntime()).rejects.toThrow("disposed");
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
});
