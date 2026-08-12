import { describe, expect, it, vi } from "vitest";

import type { AgentInstance } from "./instance";
import {
  type AgentInstanceManagerOptions,
  createAgentInstanceManager,
} from "./instance-manager";
import { type SessionTarget, toBranchId, toSessionId } from "../workspace";

function deferred<T>(): {
  promise: Promise<T>;
  resolve(value: T): void;
} {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((onResolve) => {
    resolve = onResolve;
  });
  return { promise, resolve };
}

function fakeInstance(target: SessionTarget): {
  instance: AgentInstance;
  dispose: ReturnType<typeof vi.fn<() => Promise<void>>>;
  disposeAtSafeTurnBoundary: ReturnType<
    typeof vi.fn<(signal: AbortSignal) => Promise<boolean>>
  >;
} {
  const dispose = vi.fn<() => Promise<void>>(() => Promise.resolve());
  const disposeAtSafeTurnBoundary = vi.fn<
    (signal: AbortSignal) => Promise<boolean>
  >(() => {
    void dispose();
    return Promise.resolve(true);
  });
  return {
    instance: {
      target,
      dispose,
      disposeAtSafeTurnBoundary,
    } as unknown as AgentInstance,
    dispose,
    disposeAtSafeTurnBoundary,
  };
}

describe("AgentInstanceManager", () => {
  it("shares one cold boot and then retains the warm instance", async () => {
    const target = { sessionId: toSessionId("session-1") };
    const bootGate = deferred<AgentInstance>();
    const bootInstance = vi.fn<AgentInstanceManagerOptions["bootInstance"]>(
      () => bootGate.promise,
    );
    await using manager = createAgentInstanceManager({ bootInstance });

    const first = manager.acquire(target);
    const second = manager.acquire(target);
    expect(bootInstance).toHaveBeenCalledOnce();

    const fake = fakeInstance(target);
    bootGate.resolve(fake.instance);
    const [firstRetention, secondRetention] = await Promise.all([
      first,
      second,
    ]);
    expect(firstRetention.instance).toBe(fake.instance);
    expect(secondRetention.instance).toBe(fake.instance);
    const warm = await manager.acquire(target);
    expect(warm.instance).toBe(fake.instance);
    expect(bootInstance).toHaveBeenCalledOnce();

    await Promise.all([
      firstRetention.release(),
      secondRetention.release(),
      warm.release(),
    ]);
    expect(fake.disposeAtSafeTurnBoundary).toHaveBeenCalledOnce();
  });

  it("boots distinct sessions independently", async () => {
    const a = { sessionId: toSessionId("session-a") };
    const b = { sessionId: toSessionId("session-b") };
    const instances = new Map([
      [a.sessionId, fakeInstance(a).instance],
      [b.sessionId, fakeInstance(b).instance],
    ]);
    const bootInstance = vi.fn<AgentInstanceManagerOptions["bootInstance"]>(
      (target) => {
        const instance = instances.get(target.sessionId);
        if (!instance)
          throw new Error(`Unexpected session ${target.sessionId}`);
        return Promise.resolve(instance);
      },
    );
    await using manager = createAgentInstanceManager({ bootInstance });

    const [retentionA, retentionB] = await Promise.all([
      manager.acquire(a),
      manager.acquire(b),
    ]);

    expect(retentionA.instance).not.toBe(retentionB.instance);
    expect(bootInstance).toHaveBeenCalledTimes(2);
    await Promise.all([retentionA.release(), retentionB.release()]);
  });

  it("retries a failed boot", async () => {
    const target = { sessionId: toSessionId("session-1") };
    const fake = fakeInstance(target);
    const bootInstance = vi
      .fn<AgentInstanceManagerOptions["bootInstance"]>()
      .mockRejectedValueOnce(new Error("boot failed"))
      .mockResolvedValueOnce(fake.instance);
    await using manager = createAgentInstanceManager({ bootInstance });

    await expect(manager.acquire(target)).rejects.toThrow("boot failed");
    const retention = await manager.acquire(target);
    expect(retention.instance).toBe(fake.instance);
    expect(bootInstance).toHaveBeenCalledTimes(2);
    await retention.release();
  });

  it("rejects branch-bearing targets until session coordination exists", async () => {
    const bootInstance = vi.fn<AgentInstanceManagerOptions["bootInstance"]>();
    await using manager = createAgentInstanceManager({ bootInstance });

    await expect(
      manager.acquire({
        sessionId: toSessionId("session-1"),
        branchId: toBranchId("branch-1"),
      }),
    ).rejects.toThrow("Branch session targets are not supported");
    expect(bootInstance).not.toHaveBeenCalled();
  });

  it("tears down only after the last retention releases", async () => {
    const target = { sessionId: toSessionId("session-1") };
    const fake = fakeInstance(target);
    const manager = createAgentInstanceManager({
      bootInstance: () => Promise.resolve(fake.instance),
    });
    const first = await manager.acquire(target);
    const second = await manager.acquire(target);

    await first.release();
    expect(fake.disposeAtSafeTurnBoundary).not.toHaveBeenCalled();
    await second.release();
    expect(fake.disposeAtSafeTurnBoundary).toHaveBeenCalledOnce();
    await manager.dispose();
  });

  it("clears a failed final-release teardown so acquisition can retry it", async () => {
    const target = { sessionId: toSessionId("session-1") };
    const fake = fakeInstance(target);
    fake.disposeAtSafeTurnBoundary
      .mockRejectedValueOnce(new Error("teardown failed"))
      .mockResolvedValueOnce(true);
    const bootInstance = vi.fn(() => Promise.resolve(fake.instance));
    const manager = createAgentInstanceManager({ bootInstance });
    const first = await manager.acquire(target);

    await expect(first.release()).rejects.toThrow("teardown failed");
    const second = await manager.acquire(target);
    expect(second.instance).toBe(fake.instance);
    expect(bootInstance).toHaveBeenCalledOnce();
    await second.release();
    expect(fake.disposeAtSafeTurnBoundary).toHaveBeenCalledTimes(2);
    await manager.dispose();
  });

  it("a new acquisition cancels pending running teardown", async () => {
    const target = { sessionId: toSessionId("session-1") };
    const fake = fakeInstance(target);
    const teardownStarted = deferred<AbortSignal>();
    fake.disposeAtSafeTurnBoundary.mockImplementation((signal) => {
      teardownStarted.resolve(signal);
      return new Promise((resolve) => {
        signal.addEventListener(
          "abort",
          () => {
            resolve(false);
          },
          { once: true },
        );
      });
    });
    const bootInstance = vi.fn(() => Promise.resolve(fake.instance));
    const manager = createAgentInstanceManager({ bootInstance });
    const first = await manager.acquire(target);

    const release = first.release();
    const signal = await teardownStarted.promise;
    const replacement = await manager.acquire(target);
    await release;

    expect(signal.aborted).toBe(true);
    expect(replacement.instance).toBe(fake.instance);
    expect(bootInstance).toHaveBeenCalledOnce();
    fake.disposeAtSafeTurnBoundary.mockImplementation(() =>
      Promise.resolve(true),
    );
    await replacement.release();
    await manager.dispose();
  });

  it("disposes instances that finish booting during manager disposal", async () => {
    const target = { sessionId: toSessionId("session-1") };
    const bootGate = deferred<AgentInstance>();
    const bootInstance = vi.fn<AgentInstanceManagerOptions["bootInstance"]>(
      () => bootGate.promise,
    );
    const manager = createAgentInstanceManager({ bootInstance });
    const acquisition = manager.acquire(target);
    const disposal = manager.dispose();
    const fake = fakeInstance(target);

    bootGate.resolve(fake.instance);

    await expect(acquisition).rejects.toThrow("disposed");
    await disposal;
    expect(fake.dispose).toHaveBeenCalledOnce();
    await expect(manager.acquire(target)).rejects.toThrow("disposed");
  });
});
