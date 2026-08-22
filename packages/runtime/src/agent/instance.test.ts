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
    const instance = await createAgentInstance({
      activateFeatures: () => Promise.resolve(),
      target: harness.target,
      manager: harness.manager,
      createRuntime: harness.createRuntime,
      state: { emit: () => undefined, cwd: "/workspace" },
    });

    expect(harness.createRuntime).not.toHaveBeenCalled();
    expect(instance.target).toBe(harness.target);
    expect(instance.manager).toBe(harness.manager);

    await expect(instance.bootRuntime()).resolves.toBe(harness.runtime);
    expect(harness.createRuntime).toHaveBeenCalledWith(
      harness.manager,
      instance.state,
      instance.features,
    );
  });

  it("admits only one active turn and ends it idempotently", async () => {
    const harness = createHarness();
    const instance = await createAgentInstance({
      activateFeatures: () => Promise.resolve(),
      target: harness.target,
      manager: harness.manager,
      createRuntime: harness.createRuntime,
      state: { emit: () => undefined, cwd: "/workspace" },
    });

    const cancel = vi.fn(() => Promise.resolve());
    const control = { cancel };
    const turn = instance.registerActiveTurn(control);
    expect(() => instance.registerActiveTurn(control)).toThrow(
      "Agent is already running",
    );
    expect(instance.isTurnActive()).toBe(true);
    await expect(instance.cancelActiveTurn("user")).resolves.toBe(true);
    expect(cancel).toHaveBeenCalledWith("user");
    turn[Symbol.dispose]();
    turn[Symbol.dispose]();
    expect(instance.isTurnActive()).toBe(false);
    await expect(instance.cancelActiveTurn()).resolves.toBe(false);
    const nextTurn = instance.registerActiveTurn(control);
    nextTurn[Symbol.dispose]();
    await instance[Symbol.asyncDispose]();
  });

  it("shares one runtime boot across concurrent callers", async () => {
    const harness = createHarness();
    let resolveRuntime!: (runtime: AgentSessionRuntime) => void;
    const runtimeGate = new Promise<AgentSessionRuntime>((resolve) => {
      resolveRuntime = resolve;
    });
    harness.createRuntime.mockReturnValue(runtimeGate);
    const instance = await createAgentInstance({
      activateFeatures: () => Promise.resolve(),
      target: harness.target,
      manager: harness.manager,
      createRuntime: harness.createRuntime,
      state: { emit: () => undefined, cwd: "/workspace" },
    });

    const first = instance.bootRuntime();
    const second = instance.bootRuntime();
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
      activateFeatures: () => Promise.resolve(),
      target: harness.target,
      manager: harness.manager,
      createRuntime: harness.createRuntime,
      state: { emit: () => undefined, cwd: "/workspace" },
    });

    await expect(instance.bootRuntime()).rejects.toThrow("runtime failed");
    await expect(instance.bootRuntime()).resolves.toBe(harness.runtime);
    expect(harness.createRuntime).toHaveBeenCalledTimes(2);
  });

  it("does not boot an unused runtime merely to reload it", async () => {
    const harness = createHarness();
    const instance = await createAgentInstance({
      activateFeatures: () => Promise.resolve(),
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
    const instance = await createAgentInstance({
      activateFeatures: () => Promise.resolve(),
      target: harness.target,
      manager: harness.manager,
      createRuntime: harness.createRuntime,
      state: { emit: () => undefined, cwd: "/workspace" },
    });
    await instance.bootRuntime();

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
      activateFeatures: () => Promise.resolve(),
      target: harness.target,
      manager: harness.manager,
      createRuntime: harness.createRuntime,
      state: { emit: () => undefined, cwd: "/workspace" },
    });

    void instance.bootRuntime();
    const reload = instance.reloadRuntimeIfActive();
    resolveRuntime(harness.runtime);

    await expect(reload).resolves.toBe(true);
    expect(harness.createRuntime).toHaveBeenCalledOnce();
    expect(harness.sessionReload).toHaveBeenCalledOnce();
  });

  it("awaits and disposes a pending runtime boot", async () => {
    const harness = createHarness();
    let resolveRuntime!: (runtime: AgentSessionRuntime) => void;
    const runtimeGate = new Promise<AgentSessionRuntime>((resolve) => {
      resolveRuntime = resolve;
    });
    harness.createRuntime.mockReturnValue(runtimeGate);
    const instance = await createAgentInstance({
      activateFeatures: () => Promise.resolve(),
      target: harness.target,
      manager: harness.manager,
      createRuntime: harness.createRuntime,
      state: { emit: () => undefined, cwd: "/workspace" },
    });

    const boot = instance.bootRuntime();
    const disposal = instance[Symbol.asyncDispose]();
    resolveRuntime(harness.runtime);

    await expect(boot).resolves.toBe(harness.runtime);
    await disposal;
    expect(harness.runtimeDispose).toHaveBeenCalledOnce();
  });

  it("disposes its runtime directly once its supervisor admits teardown", async () => {
    const harness = createHarness();
    const instance = await createAgentInstance({
      activateFeatures: () => Promise.resolve(),
      target: harness.target,
      manager: harness.manager,
      createRuntime: harness.createRuntime,
      state: { emit: () => undefined, cwd: "/workspace" },
    });
    await instance.bootRuntime();

    await instance[Symbol.asyncDispose]();

    expect(harness.sessionSubscribe).not.toHaveBeenCalled();
    expect(harness.runtimeDispose).toHaveBeenCalledOnce();
  });

  it("still disposes runtime and state when the final turn-state commit fails", async () => {
    const harness = createHarness();
    const instance = await createAgentInstance({
      activateFeatures: () => Promise.resolve(),
      target: harness.target,
      manager: harness.manager,
      createRuntime: harness.createRuntime,
      commitFinalTurnState: () => Promise.reject(new Error("commit failed")),
      state: { emit: () => undefined, cwd: "/workspace" },
    });
    await instance.bootRuntime();

    await expect(instance[Symbol.asyncDispose]()).rejects.toThrow(
      "disposal failed",
    );

    expect(harness.runtimeDispose).toHaveBeenCalledOnce();
  });

  it("commits final turn state before disposing instance state", async () => {
    const harness = createHarness();
    const order: string[] = [];
    const instance = await createAgentInstance({
      activateFeatures: () => Promise.resolve(),
      target: harness.target,
      manager: harness.manager,
      createRuntime: harness.createRuntime,
      commitFinalTurnState: (_manager, state) => {
        state.setCurrentModel(undefined);
        order.push("finalized");
        return Promise.resolve();
      },
      state: { emit: () => undefined, cwd: "/workspace" },
    });

    await instance[Symbol.asyncDispose]();

    expect(order).toEqual(["finalized"]);
  });

  it("activates replacement features after old cleanup fails", async () => {
    const harness = createHarness();
    const disposed: number[] = [];
    let generation = 0;
    const instance = await createAgentInstance({
      activateFeatures: (_features, bag) => {
        generation += 1;
        const activeGeneration = generation;
        bag.add({
          [Symbol.asyncDispose]: () => {
            disposed.push(activeGeneration);
            return activeGeneration === 1
              ? Promise.reject(new Error("old cleanup failed"))
              : Promise.resolve();
          },
        });
        return Promise.resolve();
      },
      target: harness.target,
      manager: harness.manager,
      createRuntime: harness.createRuntime,
      state: { emit: () => undefined, cwd: "/workspace" },
    });

    const errors = await instance.reloadFeatures();

    expect(errors).toHaveLength(1);
    expect(generation).toBe(2);
    expect(disposed).toEqual([1]);
    await instance[Symbol.asyncDispose]();
    expect(disposed).toEqual([1, 2]);
  });

  it("disposes its state and booted runtime idempotently", async () => {
    const harness = createHarness();
    const instance = await createAgentInstance({
      activateFeatures: () => Promise.resolve(),
      target: harness.target,
      manager: harness.manager,
      createRuntime: harness.createRuntime,
      state: { emit: () => undefined, cwd: "/workspace" },
    });
    await instance.bootRuntime();

    await Promise.all([
      instance[Symbol.asyncDispose](),
      instance[Symbol.asyncDispose](),
    ]);
    expect(harness.runtimeDispose).toHaveBeenCalledOnce();
  });
});
