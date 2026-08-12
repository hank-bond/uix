import type {
  AgentSessionRuntime,
  SessionManager,
} from "@earendil-works/pi-coding-agent";
import { describe, expect, it, vi } from "vitest";

import { type AgentInstanceOptions, createAgentInstance } from "./instance";
import { toSessionId } from "../workspace";

interface Harness {
  manager: SessionManager;
  runtime: AgentSessionRuntime;
  runtimeDispose: ReturnType<typeof vi.fn<() => Promise<void>>>;
  sessionReload: ReturnType<typeof vi.fn<() => Promise<void>>>;
  sessionSubscribe: ReturnType<typeof vi.fn>;
  setStreaming(streaming: boolean): void;
  emit(event: { type: string }): void;
  createRuntime: ReturnType<
    typeof vi.fn<AgentInstanceOptions["createRuntime"]>
  >;
  target: { sessionId: ReturnType<typeof toSessionId> };
}

function createHarness(): Harness {
  const manager = {} as SessionManager;
  const runtimeDispose = vi.fn<() => Promise<void>>(() => Promise.resolve());
  const sessionReload = vi.fn<() => Promise<void>>(() => Promise.resolve());
  let streaming = false;
  let listener: ((event: { type: string }) => void) | undefined;
  const sessionSubscribe = vi.fn((next: (event: { type: string }) => void) => {
    listener = next;
    return (): void => {
      listener = undefined;
    };
  });
  const runtime = {
    session: {
      get isStreaming() {
        return streaming;
      },
      reload: sessionReload,
      subscribe: sessionSubscribe,
    },
    dispose: runtimeDispose,
  } as unknown as AgentSessionRuntime;
  const createRuntime = vi.fn<AgentInstanceOptions["createRuntime"]>(() =>
    Promise.resolve(runtime),
  );
  return {
    manager,
    runtime,
    runtimeDispose,
    sessionReload,
    sessionSubscribe,
    setStreaming(value) {
      streaming = value;
    },
    emit(event) {
      listener?.(event);
    },
    createRuntime,
    target: { sessionId: toSessionId("session-1") },
  };
}

describe("AgentInstance", () => {
  it("opens its manager without booting Pi until first use", async () => {
    const harness = createHarness();
    const instance = createAgentInstance({
      target: harness.target,
      manager: harness.manager,
      createRuntime: harness.createRuntime,
      state: { emit: () => undefined, cwd: "/workspace" },
    });

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
    const instance = createAgentInstance({
      target: harness.target,
      manager: harness.manager,
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
    const instance = createAgentInstance({
      target: harness.target,
      manager: harness.manager,
      createRuntime: harness.createRuntime,
      state: { emit: () => undefined, cwd: "/workspace" },
    });

    await expect(instance.getRuntime()).rejects.toThrow("runtime failed");
    await expect(instance.getRuntime()).resolves.toBe(harness.runtime);
    expect(harness.createRuntime).toHaveBeenCalledTimes(2);
  });

  it("does not boot an unused runtime merely to reload it", async () => {
    const harness = createHarness();
    const instance = createAgentInstance({
      target: harness.target,
      manager: harness.manager,
      createRuntime: harness.createRuntime,
      state: { emit: () => undefined, cwd: "/workspace" },
    });

    await expect(instance.reloadRuntimeIfActive()).resolves.toBe(false);
    expect(harness.createRuntime).not.toHaveBeenCalled();
    expect(harness.sessionReload).not.toHaveBeenCalled();
  });

  it("reloads an active runtime", async () => {
    const harness = createHarness();
    const instance = createAgentInstance({
      target: harness.target,
      manager: harness.manager,
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
    const instance = createAgentInstance({
      target: harness.target,
      manager: harness.manager,
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
    const instance = createAgentInstance({
      target: harness.target,
      manager: harness.manager,
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

  it("disposes an idle instance at its safe boundary immediately", async () => {
    const harness = createHarness();
    const instance = createAgentInstance({
      target: harness.target,
      manager: harness.manager,
      createRuntime: harness.createRuntime,
      state: { emit: () => undefined, cwd: "/workspace" },
    });
    await instance.getRuntime();

    await expect(
      instance.disposeAtSafeTurnBoundary(new AbortController().signal),
    ).resolves.toBe(true);
    expect(harness.sessionSubscribe).not.toHaveBeenCalled();
    expect(harness.runtimeDispose).toHaveBeenCalledOnce();
  });

  it("waits for agent_end before disposing a running instance", async () => {
    const harness = createHarness();
    harness.setStreaming(true);
    const instance = createAgentInstance({
      target: harness.target,
      manager: harness.manager,
      createRuntime: harness.createRuntime,
      state: { emit: () => undefined, cwd: "/workspace" },
    });
    await instance.getRuntime();

    const safeDisposal = instance.disposeAtSafeTurnBoundary(
      new AbortController().signal,
    );
    expect(harness.runtimeDispose).not.toHaveBeenCalled();
    harness.setStreaming(false);
    harness.emit({ type: "agent_end" });

    await expect(safeDisposal).resolves.toBe(true);
    expect(harness.runtimeDispose).toHaveBeenCalledOnce();
  });

  it("cancels pending safe disposal when aborted", async () => {
    const harness = createHarness();
    harness.setStreaming(true);
    const instance = createAgentInstance({
      target: harness.target,
      manager: harness.manager,
      createRuntime: harness.createRuntime,
      state: { emit: () => undefined, cwd: "/workspace" },
    });
    await instance.getRuntime();
    const controller = new AbortController();

    const safeDisposal = instance.disposeAtSafeTurnBoundary(controller.signal);
    controller.abort();

    await expect(safeDisposal).resolves.toBe(false);
    expect(harness.runtimeDispose).not.toHaveBeenCalled();
    await expect(instance.getRuntime()).resolves.toBe(harness.runtime);
  });

  it("disposes its state and booted runtime idempotently", async () => {
    const harness = createHarness();
    const instance = createAgentInstance({
      target: harness.target,
      manager: harness.manager,
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
});
