// Owns session-keyed agent instance identity, retention, and safe teardown within one workspace runtime.

import type { AgentInstance } from "./instance";
import type { SessionId, SessionTarget } from "../workspace";

export interface AgentInstanceRetention extends AsyncDisposable {
  readonly instance: AgentInstance;
  release(): Promise<void>;
}

export interface AgentInstanceManager extends AsyncDisposable {
  /** Retain the warm primary instance or share one cold boot attempt. */
  acquire(target: SessionTarget): Promise<AgentInstanceRetention>;
  /** Dispose every live instance and await boots already in flight. */
  dispose(): Promise<void>;
}

export interface AgentInstanceManagerOptions {
  readonly bootInstance: (target: SessionTarget) => Promise<AgentInstance>;
}

interface PendingTeardown {
  readonly controller: AbortController;
  readonly promise: Promise<boolean>;
}

interface ManagedInstance {
  readonly instance: AgentInstance;
  refs: number;
  pendingTeardown?: PendingTeardown;
}

/** Creates the primary-instance manager for one workspace runtime. */
export function createAgentInstanceManager(
  opts: AgentInstanceManagerOptions,
): AgentInstanceManager {
  const instances = new Map<SessionId, ManagedInstance>();
  const inFlightBoots = new Map<SessionId, Promise<ManagedInstance>>();
  let disposal: Promise<void> | undefined;
  let disposed = false;

  function getOrBoot(target: SessionTarget): Promise<ManagedInstance> {
    const existing = instances.get(target.sessionId);
    if (existing) return Promise.resolve(existing);
    const inFlight = inFlightBoots.get(target.sessionId);
    if (inFlight) return inFlight;

    const boot = opts
      .bootInstance(target)
      .then(async (instance) => {
        if (disposed) {
          await instance.dispose();
          throw new Error("Agent instance manager is disposed");
        }
        const managed: ManagedInstance = { instance, refs: 0 };
        instances.set(target.sessionId, managed);
        return managed;
      })
      .finally(() => {
        if (inFlightBoots.get(target.sessionId) === boot) {
          inFlightBoots.delete(target.sessionId);
        }
      });
    inFlightBoots.set(target.sessionId, boot);
    return boot;
  }

  async function release(
    sessionId: SessionId,
    managed: ManagedInstance,
  ): Promise<void> {
    if (managed.refs === 0) return;
    managed.refs -= 1;
    if (managed.refs !== 0 || instances.get(sessionId) !== managed) return;

    const controller = new AbortController();
    const teardown: PendingTeardown = {
      controller,
      promise: managed.instance.disposeAtSafeTurnBoundary(controller.signal),
    };
    managed.pendingTeardown = teardown;
    try {
      const disposedAtBoundary = await teardown.promise;
      if (disposedAtBoundary && instances.get(sessionId) === managed) {
        instances.delete(sessionId);
      }
    } finally {
      if (managed.pendingTeardown === teardown) {
        managed.pendingTeardown = undefined;
      }
    }
  }

  async function acquire(
    target: SessionTarget,
  ): Promise<AgentInstanceRetention> {
    if (disposed) throw new Error("Agent instance manager is disposed");
    if (target.branchId) {
      throw new Error("Branch session targets are not supported");
    }

    let managed = await getOrBoot(target);
    const pendingTeardown = managed.pendingTeardown;
    if (pendingTeardown) {
      pendingTeardown.controller.abort();
      const disposedAtBoundary = await pendingTeardown.promise;
      if (disposedAtBoundary) {
        if (instances.get(target.sessionId) === managed) {
          instances.delete(target.sessionId);
        }
        managed = await getOrBoot(target);
      }
    }
    managed.refs += 1;
    let released = false;

    const releaseRetention = async (): Promise<void> => {
      if (released) return;
      released = true;
      await release(target.sessionId, managed);
    };
    return {
      instance: managed.instance,
      release: releaseRetention,
      [Symbol.asyncDispose]: releaseRetention,
    };
  }

  async function dispose(): Promise<void> {
    if (disposal) return disposal;
    disposed = true;
    disposal = (async () => {
      const pending = [...inFlightBoots.values()];
      await Promise.allSettled(pending);
      inFlightBoots.clear();
      const live = [...instances.values()];
      instances.clear();
      for (const managed of live) {
        managed.pendingTeardown?.controller.abort();
      }
      await Promise.all(live.map((managed) => managed.instance.dispose()));
    })();
    return disposal;
  }

  return {
    acquire,
    dispose,
    [Symbol.asyncDispose]: dispose,
  };
}
