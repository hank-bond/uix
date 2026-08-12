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
  reject(error: Error): void;
} {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((onResolve, onReject) => {
    resolve = onResolve;
    reject = onReject;
  });
  return { promise, resolve, reject };
}

function fakeInstance(target: SessionTarget): {
  instance: AgentInstance;
  dispose: ReturnType<typeof vi.fn<() => Promise<void>>>;
} {
  const dispose = vi.fn<() => Promise<void>>(() => Promise.resolve());
  return {
    instance: { target, dispose } as unknown as AgentInstance,
    dispose,
  };
}

describe("AgentInstanceManager", () => {
  it("shares one cold boot and then returns the warm instance", async () => {
    const target = { sessionId: toSessionId("session-1") };
    const bootGate = deferred<AgentInstance>();
    const bootInstance = vi.fn<AgentInstanceManagerOptions["bootInstance"]>(
      () => bootGate.promise,
    );
    await using manager = createAgentInstanceManager({ bootInstance });

    const first = manager.getOrBoot(target);
    const second = manager.getOrBoot(target);
    expect(second).toBe(first);
    expect(bootInstance).toHaveBeenCalledOnce();

    const fake = fakeInstance(target);
    bootGate.resolve(fake.instance);
    await expect(first).resolves.toBe(fake.instance);
    await expect(manager.getOrBoot(target)).resolves.toBe(fake.instance);
    expect(bootInstance).toHaveBeenCalledOnce();
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

    const [instanceA, instanceB] = await Promise.all([
      manager.getOrBoot(a),
      manager.getOrBoot(b),
    ]);

    expect(instanceA).not.toBe(instanceB);
    expect(bootInstance).toHaveBeenCalledTimes(2);
  });

  it("retries a failed boot", async () => {
    const target = { sessionId: toSessionId("session-1") };
    const fake = fakeInstance(target);
    const bootInstance = vi
      .fn<AgentInstanceManagerOptions["bootInstance"]>()
      .mockRejectedValueOnce(new Error("boot failed"))
      .mockResolvedValueOnce(fake.instance);
    await using manager = createAgentInstanceManager({ bootInstance });

    await expect(manager.getOrBoot(target)).rejects.toThrow("boot failed");
    await expect(manager.getOrBoot(target)).resolves.toBe(fake.instance);
    expect(bootInstance).toHaveBeenCalledTimes(2);
  });

  it("rejects branch-bearing targets until session coordination exists", async () => {
    const bootInstance = vi.fn<AgentInstanceManagerOptions["bootInstance"]>();
    await using manager = createAgentInstanceManager({ bootInstance });

    await expect(
      manager.getOrBoot({
        sessionId: toSessionId("session-1"),
        branchId: toBranchId("branch-1"),
      }),
    ).rejects.toThrow("Branch session targets are not supported");
    expect(bootInstance).not.toHaveBeenCalled();
  });

  it("disposes instances that finish booting during manager disposal", async () => {
    const target = { sessionId: toSessionId("session-1") };
    const bootGate = deferred<AgentInstance>();
    const bootInstance = vi.fn<AgentInstanceManagerOptions["bootInstance"]>(
      () => bootGate.promise,
    );
    const manager = createAgentInstanceManager({ bootInstance });
    const boot = manager.getOrBoot(target);
    const disposal = manager.dispose();
    const fake = fakeInstance(target);

    bootGate.resolve(fake.instance);

    await expect(boot).rejects.toThrow("disposed");
    await disposal;
    expect(fake.dispose).toHaveBeenCalledOnce();
    await expect(manager.getOrBoot(target)).rejects.toThrow("disposed");
  });
});
