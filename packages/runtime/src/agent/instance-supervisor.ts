// Supervises session-keyed agent instances and issues explicit lifetime guards.

import type { AgentInstance, AgentInstanceOwnership } from "./instance";
import { createGuard, type Guard } from "../guard";
import { createLogger } from "../log";
import type { SessionId, SessionTarget } from "../workspace";

const log = createLogger("agent-instance-supervisor");

/** A disposable veto with one supervised agent instance's operational value. */
export type AgentInstanceGuard = Guard<AgentInstance>;

export interface AgentInstanceGuardSnapshotEntry {
  readonly guardId: number;
  readonly sessionId: SessionId;
  readonly origin: string;
}

/** Point-in-time read view of the currently active agent instance guards. */
export type AgentInstanceGuardSnapshot =
  readonly AgentInstanceGuardSnapshotEntry[];

export interface AgentInstanceSupervisor extends AsyncDisposable {
  /** Resolve or create the target, then issue one guard on the accepted instance. */
  acquire(
    target: SessionTarget,
    options?: {
      readonly createInstance?: () => Promise<AgentInstanceOwnership>;
      readonly origin?: string;
    },
  ): Promise<AgentInstanceGuard>;
  /** Visit a stable snapshot under one temporary guard per live instance. */
  visitLiveInstances(
    visitor: (instance: AgentInstance) => Promise<void>,
    origin?: string,
  ): Promise<void>;
  /** Capture the currently active guards without exposing guard authority. */
  getGuardSnapshot(): AgentInstanceGuardSnapshot;
}

export interface AgentInstanceSupervisorOptions {
  readonly createInstance: (
    target: SessionTarget,
  ) => Promise<AgentInstanceOwnership>;
}

interface AgentInstanceSupervisionState {
  readonly ownership: AgentInstanceOwnership;
  readonly guards: Map<number, string>;
  readonly zeroWaiters: Set<() => void>;
  teardown?: Promise<void>;
}

/** Creates the primary-instance supervisor for one workspace agent runtime. */
export function createAgentInstanceSupervisor(
  opts: AgentInstanceSupervisorOptions,
): AgentInstanceSupervisor {
  const instances = new Map<SessionId, AgentInstanceSupervisionState>();
  const inFlightCreations = new Map<
    SessionId,
    Promise<AgentInstanceSupervisionState>
  >();
  const teardownFailures: unknown[] = [];
  let nextGuardId = 0;
  let disposal: Promise<void> | undefined;
  let disposed = false;

  function recordTeardownFailure(sessionId: SessionId, error: unknown): void {
    teardownFailures.push(error);
    log.error(
      {
        sessionId,
        err: error instanceof Error ? error.message : String(error),
      },
      "agent_instance_teardown_failed",
    );
  }

  function startTeardown(
    sessionId: SessionId,
    managed: AgentInstanceSupervisionState,
  ): Promise<void> {
    if (managed.teardown) return managed.teardown;
    const teardown = Promise.resolve()
      .then(() => managed.ownership[Symbol.asyncDispose]())
      .then(() => {
        if (instances.get(sessionId) === managed) instances.delete(sessionId);
      })
      .catch((error: unknown) => {
        recordTeardownFailure(sessionId, error);
        throw error;
      });
    managed.teardown = teardown;
    void teardown.catch(() => undefined);
    return teardown;
  }

  function notifyZero(managed: AgentInstanceSupervisionState): void {
    if (managed.guards.size !== 0) return;
    for (const resolve of managed.zeroWaiters) resolve();
    managed.zeroWaiters.clear();
  }

  function waitForZero(managed: AgentInstanceSupervisionState): Promise<void> {
    if (managed.guards.size === 0) return Promise.resolve();
    return new Promise((resolve) => {
      managed.zeroWaiters.add(resolve);
    });
  }

  function createAgentInstanceGuard(
    sessionId: SessionId,
    managed: AgentInstanceSupervisionState,
    origin: string,
  ): AgentInstanceGuard {
    if (managed.teardown || instances.get(sessionId) !== managed) {
      throw new Error("Agent instance teardown has started");
    }
    nextGuardId += 1;
    const guardId = nextGuardId;
    managed.guards.set(guardId, origin);
    return createGuard<AgentInstance>({
      label: "Agent instance",
      value: managed.ownership,
      retain: (retainedOrigin) =>
        createAgentInstanceGuard(sessionId, managed, retainedOrigin),
      onDispose: () => {
        managed.guards.delete(guardId);
        if (managed.guards.size !== 0) return;
        notifyZero(managed);
        void startTeardown(sessionId, managed);
      },
    });
  }

  function getOrCreate(
    target: SessionTarget,
    createInstance: () => Promise<AgentInstanceOwnership> = () =>
      opts.createInstance(target),
  ): Promise<AgentInstanceSupervisionState> {
    const existing = instances.get(target.sessionId);
    if (existing && !existing.teardown) return Promise.resolve(existing);
    const inFlight = inFlightCreations.get(target.sessionId);
    if (inFlight) return inFlight;

    const creation = createInstance()
      .then(async (ownership) => {
        if (disposed) {
          try {
            await ownership[Symbol.asyncDispose]();
          } catch (error) {
            recordTeardownFailure(target.sessionId, error);
            throw error;
          }
          throw new Error("Agent instance supervisor is disposed");
        }
        const managed: AgentInstanceSupervisionState = {
          ownership,
          guards: new Map(),
          zeroWaiters: new Set(),
        };
        instances.set(target.sessionId, managed);
        return managed;
      })
      .finally(() => {
        if (inFlightCreations.get(target.sessionId) === creation) {
          inFlightCreations.delete(target.sessionId);
        }
      });
    inFlightCreations.set(target.sessionId, creation);
    return creation;
  }

  async function acquire(
    target: SessionTarget,
    options?: {
      readonly createInstance?: () => Promise<AgentInstanceOwnership>;
      readonly origin?: string;
    },
  ): Promise<AgentInstanceGuard> {
    if (disposed) throw new Error("Agent instance supervisor is disposed");
    if (target.branchId) {
      throw new Error("Branch session targets are not supported");
    }

    const existing = instances.get(target.sessionId);
    if (existing?.teardown) await existing.teardown;

    const state = await getOrCreate(target, options?.createInstance);
    if (disposal) throw new Error("Agent instance supervisor is disposed");
    return createAgentInstanceGuard(
      target.sessionId,
      state,
      options?.origin ?? "acquire",
    );
  }

  async function dispose(): Promise<void> {
    if (disposal) return disposal;
    disposed = true;
    disposal = (async () => {
      const pending = [...inFlightCreations.values()];
      await Promise.allSettled(pending);
      inFlightCreations.clear();

      const live = [...instances.entries()];
      await Promise.allSettled(
        live.map(async ([sessionId, managed]) => {
          await waitForZero(managed);
          await startTeardown(sessionId, managed);
        }),
      );
      instances.clear();
      if (teardownFailures.length > 0) {
        throw new AggregateError(
          teardownFailures,
          "One or more agent instance teardowns failed",
        );
      }
    })();
    return disposal;
  }

  return {
    acquire,
    async visitLiveInstances(visitor, origin = "visit-live-instances") {
      if (disposed) throw new Error("Agent instance supervisor is disposed");
      const guards = [...instances.entries()]
        .filter(([, managed]) => !managed.teardown)
        .map(([sessionId, managed]) =>
          createAgentInstanceGuard(sessionId, managed, origin),
        );
      await Promise.all(
        guards.map(async (guard) => {
          using operationGuard = guard;
          await visitor(operationGuard.value);
        }),
      );
    },
    getGuardSnapshot() {
      return [...instances.entries()].flatMap(([sessionId, managed]) =>
        [...managed.guards.entries()].map(([guardId, origin]) => ({
          guardId,
          sessionId,
          origin,
        })),
      );
    },
    [Symbol.asyncDispose]: dispose,
  };
}
