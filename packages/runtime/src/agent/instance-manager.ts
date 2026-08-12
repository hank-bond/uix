// Owns session-keyed agent instance identity and single-flight boot within one workspace runtime.

import type { AgentInstance } from "./instance";
import type { SessionId, SessionTarget } from "../workspace";

export interface AgentInstanceManager extends AsyncDisposable {
  /** Return the warm primary instance or share one cold boot attempt. */
  getOrBoot(target: SessionTarget): Promise<AgentInstance>;
  /** Dispose every live instance and await boots already in flight. */
  dispose(): Promise<void>;
}

export interface AgentInstanceManagerOptions {
  readonly bootInstance: (target: SessionTarget) => Promise<AgentInstance>;
}

/** Creates the primary-instance manager for one workspace runtime. */
export function createAgentInstanceManager(
  opts: AgentInstanceManagerOptions,
): AgentInstanceManager {
  const instances = new Map<SessionId, AgentInstance>();
  const inFlightBoots = new Map<SessionId, Promise<AgentInstance>>();
  let disposal: Promise<void> | undefined;
  let disposed = false;

  function getOrBoot(target: SessionTarget): Promise<AgentInstance> {
    if (disposed) {
      return Promise.reject(new Error("Agent instance manager is disposed"));
    }
    if (target.branchId) {
      return Promise.reject(
        new Error("Branch session targets are not supported"),
      );
    }

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
        instances.set(target.sessionId, instance);
        return instance;
      })
      .finally(() => {
        if (inFlightBoots.get(target.sessionId) === boot) {
          inFlightBoots.delete(target.sessionId);
        }
      });
    inFlightBoots.set(target.sessionId, boot);
    return boot;
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
      await Promise.all(live.map((instance) => instance.dispose()));
    })();
    return disposal;
  }

  return {
    getOrBoot,
    dispose,
    [Symbol.asyncDispose]: dispose,
  };
}
