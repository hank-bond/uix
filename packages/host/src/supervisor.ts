// host-level workspace supervision: id → single-flight boot → WorkspaceHandle,
// with acquire/release retention and deterministic teardown at zero refs.
//
// The supervisor owns workspace policy: boot coalescing, retention, and
// process placement. It never touches feature payloads or agent internals, and
// it never assumes a runtime lives in its process. A local handle and a future
// proxy handle stay behind the same WorkspaceHandle interface.

import type { WorkspaceId, WorkspaceRuntime } from "@uix/runtime";

import type { WorkspaceHandle } from "./workspace-handle";
import { LocalWorkspaceHandle } from "./workspace-handle";

export interface SupervisorOptions {
  /** Boot a runtime for a workspace id. The host owns the boot policy. */
  boot(workspaceId: WorkspaceId): Promise<WorkspaceRuntime>;
}

interface SupervisorEntry {
  /** Resolves once the runtime is booted, and rejects if the boot failed. */
  readonly handle: Promise<WorkspaceHandle>;
  /** Settles when the boot attempt finishes, success or failure. */
  readonly boot: Promise<void>;
  refs: number;
}

export class Supervisor {
  readonly #options: SupervisorOptions;
  readonly #entries = new Map<WorkspaceId, SupervisorEntry>();

  constructor(options: SupervisorOptions) {
    this.#options = options;
  }

  /**
   * Acquire a workspace handle, booting its runtime single-flight. Concurrent
   * acquires for one workspace share one boot promise and one handle. Every
   * acquire must be matched by a release. At zero refs the handle and its
   * runtime tear down deterministically.
   */
  async acquire(workspaceId: WorkspaceId): Promise<WorkspaceHandle> {
    const existing = this.#entries.get(workspaceId);
    if (existing) {
      const handle = await existing.handle;
      existing.refs += 1;
      return handle;
    }

    const runtimePromise = this.#options.boot(workspaceId);
    const entry: SupervisorEntry = {
      handle: runtimePromise.then(
        (runtime) => new LocalWorkspaceHandle(runtime),
      ),
      boot: runtimePromise.then(
        () => undefined,
        () => undefined,
      ),
      refs: 1,
    };
    this.#entries.set(workspaceId, entry);

    try {
      return await entry.handle;
    } catch (error) {
      // The boot failed: drop the entry so a later acquire retries fresh.
      this.#entries.delete(workspaceId);
      throw error;
    }
  }

  /** Release one acquire. Idempotent. At zero refs the workspace tears down. */
  async release(workspaceId: WorkspaceId): Promise<void> {
    const entry = this.#entries.get(workspaceId);
    if (!entry) return;
    entry.refs -= 1;
    if (entry.refs > 0) return;
    this.#entries.delete(workspaceId);
    await (await entry.handle).dispose();
  }

  /** Dispose every retained workspace, regardless of remaining refs. */
  async dispose(): Promise<void> {
    const entries = [...this.#entries.values()];
    this.#entries.clear();
    for (const entry of entries) {
      const handle = await entry.handle.catch(() => undefined);
      if (handle) await handle.dispose();
    }
  }
}
