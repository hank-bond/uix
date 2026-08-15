import { describe, expect, it, vi } from "vitest";

import type { AgentInstance } from "./instance";
import {
  type AgentInstanceSupervisorOptions,
  createAgentInstanceSupervisor,
} from "./instance-supervisor";
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
} {
  const dispose = vi.fn<() => Promise<void>>(() => Promise.resolve());
  return {
    instance: { target, dispose } as unknown as AgentInstance,
    dispose,
  };
}

describe("AgentInstanceSupervisor", () => {
  it("shares one cold creation and issues independent guards", async () => {
    const target = { sessionId: toSessionId("session-1") };
    const creationGate = deferred<AgentInstance>();
    const createInstance = vi.fn<
      AgentInstanceSupervisorOptions["createInstance"]
    >(() => creationGate.promise);
    const supervisor = createAgentInstanceSupervisor({ createInstance });

    const first = supervisor.acquire(target, { origin: "attachment-a" });
    const second = supervisor.acquire(target, { origin: "attachment-b" });
    expect(createInstance).toHaveBeenCalledOnce();
    expect(supervisor.getGuardSnapshot()).toEqual([]);

    const fake = fakeInstance(target);
    creationGate.resolve(fake.instance);
    const [guardA, guardB] = await Promise.all([first, second]);
    expect(guardA.instance).toBe(fake.instance);
    expect(guardB.instance).toBe(fake.instance);
    expect(supervisor.getGuardSnapshot().map(({ origin }) => origin)).toEqual([
      "attachment-a",
      "attachment-b",
    ]);

    guardA.release();
    expect(fake.dispose).not.toHaveBeenCalled();
    guardB.release();
    await Promise.resolve();
    expect(fake.dispose).toHaveBeenCalledOnce();
    await supervisor.dispose();
  });

  it("retains independent operation and turn guards synchronously", async () => {
    const target = { sessionId: toSessionId("session-1") };
    const fake = fakeInstance(target);
    const supervisor = createAgentInstanceSupervisor({
      createInstance: () => Promise.resolve(fake.instance),
    });
    const attachment = await supervisor.acquire(target, {
      origin: "attachment",
    });
    const operation = attachment.retain("dispatch");
    const turn = operation.retain("turn");

    attachment.release();
    operation.release();
    expect(fake.dispose).not.toHaveBeenCalled();
    expect(supervisor.getGuardSnapshot()).toHaveLength(1);

    turn.release();
    await Promise.resolve();
    expect(fake.dispose).toHaveBeenCalledOnce();
    expect(() => operation.retain()).toThrow("released");
    await supervisor.dispose();
  });

  it("makes final release immediate while teardown remains asynchronous", async () => {
    const target = { sessionId: toSessionId("session-1") };
    const teardownGate = deferred<undefined>();
    const fake = fakeInstance(target);
    fake.dispose.mockReturnValue(teardownGate.promise);
    const supervisor = createAgentInstanceSupervisor({
      createInstance: () => Promise.resolve(fake.instance),
    });
    const guard = await supervisor.acquire(target);

    guard.release();

    await Promise.resolve();
    expect(fake.dispose).toHaveBeenCalledOnce();
    let drained = false;
    const disposal = supervisor.dispose().then(() => {
      drained = true;
    });
    await Promise.resolve();
    expect(drained).toBe(false);
    teardownGate.resolve(undefined);
    await disposal;
    expect(drained).toBe(true);
  });

  it("waits for admitted teardown before creating a fresh instance", async () => {
    const target = { sessionId: toSessionId("session-1") };
    const teardownGate = deferred<undefined>();
    const first = fakeInstance(target);
    const second = fakeInstance(target);
    first.dispose.mockReturnValue(teardownGate.promise);
    const createInstance = vi
      .fn<AgentInstanceSupervisorOptions["createInstance"]>()
      .mockResolvedValueOnce(first.instance)
      .mockResolvedValueOnce(second.instance);
    const supervisor = createAgentInstanceSupervisor({ createInstance });
    const oldGuard = await supervisor.acquire(target);
    oldGuard.release();

    const acquisition = supervisor.acquire(target);
    await Promise.resolve();
    expect(createInstance).toHaveBeenCalledOnce();
    teardownGate.resolve(undefined);

    const newGuard = await acquisition;
    expect(newGuard.instance).toBe(second.instance);
    expect(createInstance).toHaveBeenCalledTimes(2);
    newGuard.release();
    await supervisor.dispose();
  });

  it("visits a stable snapshot under temporary guards", async () => {
    const a = { sessionId: toSessionId("session-a") };
    const b = { sessionId: toSessionId("session-b") };
    const instances = new Map([
      [a.sessionId, fakeInstance(a)],
      [b.sessionId, fakeInstance(b)],
    ]);
    const supervisor = createAgentInstanceSupervisor({
      createInstance: (target) => {
        const found = instances.get(target.sessionId);
        if (!found) throw new Error(`Unexpected session ${target.sessionId}`);
        return Promise.resolve(found.instance);
      },
    });
    const guardA = await supervisor.acquire(a);
    const guardB = await supervisor.acquire(b);
    const visited: AgentInstance[] = [];

    await supervisor.visit((guard) => {
      visited.push(guard.instance);
      expect(
        supervisor.getGuardSnapshot().some(({ origin }) => origin === "reload"),
      ).toBe(true);
      return Promise.resolve();
    }, "reload");

    expect(visited).toHaveLength(2);
    guardA.release();
    guardB.release();
    await supervisor.dispose();
  });

  it("uses an acquisition-provided creation only for a cold target", async () => {
    const target = { sessionId: toSessionId("session-1") };
    const fallback = fakeInstance(target);
    const provided = fakeInstance(target);
    const createInstance = vi.fn(() => Promise.resolve(fallback.instance));
    const providedCreation = vi.fn(() => Promise.resolve(provided.instance));
    const supervisor = createAgentInstanceSupervisor({ createInstance });

    const first = await supervisor.acquire(target, {
      createInstance: providedCreation,
    });
    const second = await supervisor.acquire(target, {
      createInstance: providedCreation,
    });

    expect(first.instance).toBe(provided.instance);
    expect(second.instance).toBe(provided.instance);
    expect(providedCreation).toHaveBeenCalledOnce();
    expect(createInstance).not.toHaveBeenCalled();
    first.release();
    second.release();
    await supervisor.dispose();
  });

  it("rejects reacquisition when the previous instance teardown fails", async () => {
    const target = { sessionId: toSessionId("session-1") };
    const fake = fakeInstance(target);
    fake.dispose.mockRejectedValue(new Error("teardown failed"));
    const createInstance = vi.fn(() => Promise.resolve(fake.instance));
    const supervisor = createAgentInstanceSupervisor({ createInstance });
    const guard = await supervisor.acquire(target);

    guard.release();

    await expect(supervisor.acquire(target)).rejects.toThrow("teardown failed");
    expect(createInstance).toHaveBeenCalledOnce();
    await expect(supervisor.dispose()).rejects.toThrow(
      "One or more agent instance teardowns failed",
    );
  });

  it("observes disposal failure from creation during shutdown", async () => {
    const target = { sessionId: toSessionId("session-1") };
    const creationGate = deferred<AgentInstance>();
    const fake = fakeInstance(target);
    fake.dispose.mockRejectedValue(new Error("late teardown failed"));
    const supervisor = createAgentInstanceSupervisor({
      createInstance: () => creationGate.promise,
    });
    const acquisition = supervisor.acquire(target);
    const disposal = supervisor.dispose();

    creationGate.resolve(fake.instance);

    await expect(acquisition).rejects.toThrow("late teardown failed");
    await expect(disposal).rejects.toThrow(
      "One or more agent instance teardowns failed",
    );
  });

  it("retries a failed creation", async () => {
    const target = { sessionId: toSessionId("session-1") };
    const fake = fakeInstance(target);
    const createInstance = vi
      .fn<AgentInstanceSupervisorOptions["createInstance"]>()
      .mockRejectedValueOnce(new Error("creation failed"))
      .mockResolvedValueOnce(fake.instance);
    const supervisor = createAgentInstanceSupervisor({ createInstance });

    await expect(supervisor.acquire(target)).rejects.toThrow("creation failed");
    const guard = await supervisor.acquire(target);
    guard.release();
    await supervisor.dispose();
  });

  it("rejects branch-bearing targets until session coordination exists", async () => {
    const createInstance =
      vi.fn<AgentInstanceSupervisorOptions["createInstance"]>();
    const supervisor = createAgentInstanceSupervisor({ createInstance });

    await expect(
      supervisor.acquire({
        sessionId: toSessionId("session-1"),
        branchId: toBranchId("branch-1"),
      }),
    ).rejects.toThrow("Branch session targets are not supported");
    expect(createInstance).not.toHaveBeenCalled();
    await supervisor.dispose();
  });

  it("stops admission and drains existing guards during parent disposal", async () => {
    const target = { sessionId: toSessionId("session-1") };
    const fake = fakeInstance(target);
    const supervisor = createAgentInstanceSupervisor({
      createInstance: () => Promise.resolve(fake.instance),
    });
    const guard = await supervisor.acquire(target);
    const disposal = supervisor.dispose();

    await expect(supervisor.acquire(target)).rejects.toThrow("disposed");
    expect(fake.dispose).not.toHaveBeenCalled();
    guard.release();

    await disposal;
    expect(fake.dispose).toHaveBeenCalledOnce();
  });
});
