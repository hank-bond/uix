// Supervises workspace-keyed runtimes and issues independent workspace guards.

import type { WorkspaceId, WorkspaceRuntime } from "@uix/runtime";

import { SupervisedWorkspace, type WorkspaceHandle } from "./workspace-handle";

export interface WorkspaceSupervisorOptions {
  /** Boot a runtime for a workspace id. The host owns the boot policy. */
  boot(workspaceId: WorkspaceId): Promise<WorkspaceRuntime>;
}

/** An independent teardown veto that provides the shared workspace handle. */
export interface WorkspaceGuard extends Disposable {
  readonly handle: WorkspaceHandle;
  /** Mint another independently releasable guard on the same workspace. */
  retain(origin?: string): WorkspaceGuard;
  /** Relinquish this guard. Immediate, idempotent, and non-blocking. */
  release(): void;
}

export interface WorkspaceGuardSnapshotEntry {
  readonly guardId: number;
  readonly workspaceId: WorkspaceId;
  readonly origin: string;
}

/** Point-in-time read view of the currently active workspace guards. */
export type WorkspaceGuardSnapshot = readonly WorkspaceGuardSnapshotEntry[];

interface WorkspaceInstanceSupervisionState {
  readonly workspace: SupervisedWorkspace;
  readonly guards: Map<number, string>;
  readonly zeroWaiters: Set<() => void>;
  teardown?: Promise<void>;
}

export class WorkspaceSupervisor implements AsyncDisposable {
  readonly #options: WorkspaceSupervisorOptions;
  readonly #instances = new Map<
    WorkspaceId,
    WorkspaceInstanceSupervisionState
  >();
  readonly #inFlightCreations = new Map<
    WorkspaceId,
    Promise<WorkspaceInstanceSupervisionState>
  >();
  readonly #teardownFailures: unknown[] = [];
  #nextGuardId = 0;
  #disposal: Promise<void> | undefined;
  #disposed = false;

  constructor(options: WorkspaceSupervisorOptions) {
    this.#options = options;
  }

  /** Resolve or boot one workspace, then issue an independent lifetime guard. */
  async acquire(
    workspaceId: WorkspaceId,
    origin = "acquire",
  ): Promise<WorkspaceGuard> {
    if (this.#disposed) throw new Error("Workspace supervisor is disposed");

    const existing = this.#instances.get(workspaceId);
    if (existing?.teardown) await existing.teardown;
    if (this.#isDisposed()) {
      throw new Error("Workspace supervisor is disposed");
    }

    const state = await this.#getOrCreate(workspaceId);
    if (this.#isDisposed()) {
      throw new Error("Workspace supervisor is disposed");
    }
    return this.#createGuard(workspaceId, state, origin);
  }

  /** Capture the currently active guards without exposing guard authority. */
  getGuardSnapshot(): WorkspaceGuardSnapshot {
    return [...this.#instances.entries()].flatMap(([workspaceId, state]) =>
      [...state.guards.entries()].map(([guardId, origin]) => ({
        guardId,
        workspaceId,
        origin,
      })),
    );
  }

  /** Stop admission, drain every guard, and await actual workspace teardown. */
  dispose(): Promise<void> {
    if (this.#disposal) return this.#disposal;
    this.#disposed = true;
    this.#disposal = (async () => {
      const pending = [...this.#inFlightCreations.values()];
      await Promise.allSettled(pending);
      this.#inFlightCreations.clear();

      const live = [...this.#instances.entries()];
      await Promise.allSettled(
        live.map(async ([workspaceId, state]) => {
          await this.#waitForZero(state);
          await this.#startTeardown(workspaceId, state);
        }),
      );
      this.#instances.clear();
      if (this.#teardownFailures.length > 0) {
        throw new AggregateError(
          this.#teardownFailures,
          "One or more workspaces failed to tear down",
        );
      }
    })();
    return this.#disposal;
  }

  [Symbol.asyncDispose](): Promise<void> {
    return this.dispose();
  }

  #isDisposed(): boolean {
    return this.#disposed;
  }

  #recordTeardownFailure(error: unknown): void {
    this.#teardownFailures.push(error);
  }

  #getOrCreate(
    workspaceId: WorkspaceId,
  ): Promise<WorkspaceInstanceSupervisionState> {
    const existing = this.#instances.get(workspaceId);
    if (existing && !existing.teardown) return Promise.resolve(existing);
    const inFlight = this.#inFlightCreations.get(workspaceId);
    if (inFlight) return inFlight;

    const creation = this.#options
      .boot(workspaceId)
      .then((runtime) => new SupervisedWorkspace(runtime))
      .then(async (workspace) => {
        if (this.#disposed) {
          try {
            await workspace.dispose();
          } catch (error) {
            this.#recordTeardownFailure(error);
            throw error;
          }
          throw new Error("Workspace supervisor is disposed");
        }
        const state: WorkspaceInstanceSupervisionState = {
          workspace,
          guards: new Map(),
          zeroWaiters: new Set(),
        };
        this.#instances.set(workspaceId, state);
        return state;
      })
      .finally(() => {
        if (this.#inFlightCreations.get(workspaceId) === creation) {
          this.#inFlightCreations.delete(workspaceId);
        }
      });
    this.#inFlightCreations.set(workspaceId, creation);
    return creation;
  }

  #createGuard(
    workspaceId: WorkspaceId,
    state: WorkspaceInstanceSupervisionState,
    origin: string,
  ): WorkspaceGuard {
    if (state.teardown || this.#instances.get(workspaceId) !== state) {
      throw new Error("Workspace teardown has started");
    }
    this.#nextGuardId += 1;
    const guardId = this.#nextGuardId;
    state.guards.set(guardId, origin);
    let released = false;

    const release = (): void => {
      if (released) return;
      released = true;
      state.guards.delete(guardId);
      if (state.guards.size !== 0) return;
      this.#notifyZero(state);
      void this.#startTeardown(workspaceId, state);
    };

    return {
      handle: state.workspace.handle,
      retain: (retainedOrigin = "retained") => {
        if (released) throw new Error("Workspace guard is released");
        return this.#createGuard(workspaceId, state, retainedOrigin);
      },
      release,
      [Symbol.dispose]: release,
    };
  }

  #startTeardown(
    workspaceId: WorkspaceId,
    state: WorkspaceInstanceSupervisionState,
  ): Promise<void> {
    if (state.teardown) return state.teardown;
    const teardown = Promise.resolve()
      .then(() => state.workspace.dispose())
      .then(() => {
        if (this.#instances.get(workspaceId) === state) {
          this.#instances.delete(workspaceId);
        }
      })
      .catch((error: unknown) => {
        this.#recordTeardownFailure(error);
        throw error;
      });
    state.teardown = teardown;
    void teardown.catch(() => undefined);
    return teardown;
  }

  #notifyZero(state: WorkspaceInstanceSupervisionState): void {
    if (state.guards.size !== 0) return;
    for (const resolve of state.zeroWaiters) resolve();
    state.zeroWaiters.clear();
  }

  #waitForZero(state: WorkspaceInstanceSupervisionState): Promise<void> {
    if (state.guards.size === 0) return Promise.resolve();
    return new Promise((resolve) => {
      state.zeroWaiters.add(resolve);
    });
  }
}
