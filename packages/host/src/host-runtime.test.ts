// In-memory proof of workspace supervision, unified attachments, prepared dispatch, and scoped delivery.

import { describe, expect, it, vi } from "vitest";

import { toChannelCanonicalId } from "@uix/api/channel-resolution";
import type {
  ActivationResult,
  Attachment,
  AttachmentId,
  CanonicalRequest,
  CanonicalResponse,
  CreatedAttachment,
  EventScope,
  PreparedDispatch,
  ReloadResult,
  RuntimeEvent,
  SessionId,
  SessionTarget,
  WorkspaceId,
  WorkspaceRuntime,
} from "@uix/runtime";
import { toAttachmentId, toSessionId, toWorkspaceId } from "@uix/runtime";

import { type WorkspaceGuard, WorkspaceSupervisor } from "./supervisor";

function deferred<T = void>(): {
  promise: Promise<T>;
  resolve(value: T): void;
} {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((onResolve) => {
    resolve = onResolve;
  });
  return { promise, resolve };
}

interface FakeAttachmentDispatchContext {
  workspaceId: WorkspaceId;
  attachmentId: AttachmentId;
  target: SessionTarget;
}
type Handler = (
  payload: unknown,
  context: FakeAttachmentDispatchContext,
) => unknown;

interface FakeAgentInstanceSupervisionState {
  readonly guards: Set<FakeAgentInstanceGuard>;
}

class FakeAgentInstanceGuard implements Disposable {
  readonly #supervisor: FakeAgentInstanceSupervisor;
  readonly sessionId: SessionId;
  #disposed = false;

  constructor(supervisor: FakeAgentInstanceSupervisor, sessionId: SessionId) {
    this.#supervisor = supervisor;
    this.sessionId = sessionId;
  }

  retain(): FakeAgentInstanceGuard {
    if (this.#disposed) throw new Error("Agent instance guard is disposed");
    return this.#supervisor.retain(this);
  }

  [Symbol.dispose](): void {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#supervisor.dropGuard(this);
  }
}

class FakeAgentInstanceSupervisor {
  readonly #instances = new Map<SessionId, FakeAgentInstanceSupervisionState>();
  readonly #failNextCreation = new Set<SessionId>();
  creationCount = 0;

  failNextCreation(sessionId: SessionId): void {
    this.#failNextCreation.add(sessionId);
  }

  acquire(sessionId: SessionId): Promise<FakeAgentInstanceGuard> {
    let state = this.#instances.get(sessionId);
    if (!state) {
      if (this.#failNextCreation.delete(sessionId)) {
        return Promise.reject(
          new Error(`Creation failed for session ${sessionId}`),
        );
      }
      this.creationCount += 1;
      state = { guards: new Set() };
      this.#instances.set(sessionId, state);
    }
    return Promise.resolve(this.#createGuard(sessionId, state));
  }

  retain(guard: FakeAgentInstanceGuard): FakeAgentInstanceGuard {
    const state = this.#instances.get(guard.sessionId);
    if (!state || !state.guards.has(guard)) {
      throw new Error(`Unknown live session ${guard.sessionId}`);
    }
    return this.#createGuard(guard.sessionId, state);
  }

  dropGuard(guard: FakeAgentInstanceGuard): void {
    const state = this.#instances.get(guard.sessionId);
    if (!state) return;
    state.guards.delete(guard);
    if (state.guards.size === 0) this.#instances.delete(guard.sessionId);
  }

  guardsFor(sessionId: SessionId): number {
    return this.#instances.get(sessionId)?.guards.size ?? 0;
  }

  get liveInstances(): number {
    return this.#instances.size;
  }

  #createGuard(
    sessionId: SessionId,
    state: FakeAgentInstanceSupervisionState,
  ): FakeAgentInstanceGuard {
    const guard = new FakeAgentInstanceGuard(this, sessionId);
    state.guards.add(guard);
    return guard;
  }
}

class FakeAttachment implements Attachment {
  readonly #runtime: FakeRuntime;
  readonly #eventListeners = new Set<(event: RuntimeEvent) => void>();
  readonly #closeListeners = new Set<() => void>();
  readonly attachmentId: AttachmentId;
  readonly workspaceId: WorkspaceId;
  #target: SessionTarget;
  #targetGuard: FakeAgentInstanceGuard;
  #disposed = false;

  constructor(
    runtime: FakeRuntime,
    attachmentId: AttachmentId,
    target: SessionTarget,
    targetGuard: FakeAgentInstanceGuard,
  ) {
    this.#runtime = runtime;
    this.attachmentId = attachmentId;
    this.workspaceId = runtime.workspaceId;
    this.#target = target;
    this.#targetGuard = targetGuard;
  }

  get target(): SessionTarget {
    return this.#target;
  }

  prepareDispatch(request: CanonicalRequest): PreparedDispatch {
    if (this.#disposed) throw new Error("Attachment is disposed");
    const acceptedTarget = this.#target;
    const workspaceId = this.workspaceId;
    const attachmentId = this.attachmentId;
    const handler = this.#runtime.handlers.get(request.channel);
    const operationGuard = this.#targetGuard.retain();
    let invoked = false;
    let disposed = false;
    const dispose = (): void => {
      if (disposed) return;
      disposed = true;
      operationGuard[Symbol.dispose]();
    };
    return {
      request,
      logOptions: handler
        ? {}
        : { describeRequest: () => ({ channel: request.channel }) },
      async invoke(): Promise<CanonicalResponse> {
        if (disposed) {
          return {
            ok: false,
            error: { code: "disposed", message: "Prepared dispatch disposed" },
          };
        }
        if (invoked) {
          return {
            ok: false,
            error: { code: "already_invoked", message: "Already invoked" },
          };
        }
        invoked = true;
        try {
          if (!handler) {
            return {
              ok: false,
              error: {
                code: "unknown_channel",
                message: `Unknown channel ${request.channel}`,
              },
            };
          }
          return {
            ok: true,
            value: await handler(request.payload, {
              workspaceId,
              attachmentId,
              target: acceptedTarget,
            }),
          };
        } catch (error) {
          return {
            ok: false,
            error: {
              code: "handler_error",
              message: error instanceof Error ? error.message : String(error),
            },
          };
        } finally {
          dispose();
        }
      },
      [Symbol.dispose]: dispose,
    };
  }

  async retarget(target: SessionTarget): Promise<void> {
    if (this.#disposed) throw new Error("Attachment is disposed");
    const nextGuard = await this.#runtime.agents.acquire(target.sessionId);
    const previousGuard = this.#targetGuard;
    this.#target = target;
    this.#targetGuard = nextGuard;
    previousGuard[Symbol.dispose]();
  }

  onEvent(listener: (event: RuntimeEvent) => void): Disposable {
    this.#eventListeners.add(listener);
    return {
      [Symbol.dispose]: () => this.#eventListeners.delete(listener),
    };
  }

  onClose(listener: () => void): Disposable {
    this.#closeListeners.add(listener);
    return {
      [Symbol.dispose]: () => this.#closeListeners.delete(listener),
    };
  }

  deliver(event: RuntimeEvent): void {
    if (this.#disposed) return;
    for (const listener of this.#eventListeners) listener(event);
  }

  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#targetGuard[Symbol.dispose]();
    this.#eventListeners.clear();
    for (const listener of this.#closeListeners) listener();
    this.#closeListeners.clear();
  }

  [Symbol.dispose](): void {
    this.dispose();
  }
}

class FakeRuntime implements WorkspaceRuntime {
  readonly workspaceId: WorkspaceId;
  readonly agents = new FakeAgentInstanceSupervisor();
  readonly handlers = new Map<string, Handler>();
  readonly #listeners = new Set<(event: RuntimeEvent) => void>();
  #nextAttachment = 0;
  attachmentGate: Promise<void> | undefined;
  disposeError: Error | undefined;
  disposed = false;

  constructor(workspaceId: WorkspaceId) {
    this.workspaceId = workspaceId;
  }

  register(channel: string, handler: Handler): void {
    this.handlers.set(channel, handler);
  }

  onEvent(listener: (event: RuntimeEvent) => void): Disposable {
    this.#listeners.add(listener);
    return {
      [Symbol.dispose]: () => this.#listeners.delete(listener),
    };
  }

  emit(scope: EventScope, id: string, payload: unknown): void {
    const event: RuntimeEvent = {
      id,
      channel: toChannelCanonicalId("test", "event"),
      scope,
      payload,
    };
    for (const listener of this.#listeners) listener(event);
  }

  load(): Promise<ActivationResult> {
    return Promise.resolve({ activated: [], failed: [] });
  }

  reload(): Promise<ReloadResult> {
    return Promise.resolve({
      featuresActivated: 0,
      featuresFailed: 0,
      failures: [],
      piResourcesReloaded: false,
    });
  }

  async createAttachment(target?: SessionTarget): Promise<CreatedAttachment> {
    await this.attachmentGate;
    const acceptedTarget = target ?? { sessionId: s1 };
    const targetGuard = await this.agents.acquire(acceptedTarget.sessionId);
    this.#nextAttachment += 1;
    const attachment = new FakeAttachment(
      this,
      toAttachmentId(`attachment-${String(this.#nextAttachment)}`),
      acceptedTarget,
      targetGuard,
    );
    return {
      attachment,
      deliver: (event) => {
        attachment.deliver(event);
      },
    };
  }

  dispose(): Promise<void> {
    this.disposed = true;
    this.#listeners.clear();
    return this.disposeError
      ? Promise.reject(this.disposeError)
      : Promise.resolve();
  }

  [Symbol.dispose](): void {
    void this.dispose();
  }
}

async function dispatch(
  workspaceGuard: WorkspaceGuard,
  attachment: Attachment,
  request: CanonicalRequest,
): Promise<CanonicalResponse> {
  using _workspaceOperationGuard = workspaceGuard.retain("dispatch");
  using prepared = attachment.prepareDispatch(request);
  return await prepared.invoke();
}

function track(attachment: Attachment, byId: Map<string, string[]>): void {
  attachment.onEvent((event) => {
    const seen = byId.get(attachment.attachmentId) ?? [];
    seen.push(event.id);
    byId.set(attachment.attachmentId, seen);
  });
}

const ws1 = toWorkspaceId("workspace-1");
const ws2 = toWorkspaceId("workspace-2");
const s1 = toSessionId("session-1");
const s2 = toSessionId("session-2");

function supervisorWithBoot(
  boot: (workspaceId: WorkspaceId) => Promise<WorkspaceRuntime>,
): WorkspaceSupervisor {
  return new WorkspaceSupervisor({ boot });
}

function supervisorFor(runtime: FakeRuntime): WorkspaceSupervisor {
  return new WorkspaceSupervisor({ boot: () => Promise.resolve(runtime) });
}

describe("workspace supervisor", () => {
  it("boots one workspace and issues independent guards", async () => {
    let bootCalls = 0;
    const supervisor = supervisorWithBoot((workspaceId) => {
      bootCalls += 1;
      return Promise.resolve(new FakeRuntime(workspaceId));
    });

    const [first, second] = await Promise.all([
      supervisor.acquire(ws1, "connection-a"),
      supervisor.acquire(ws1, "connection-b"),
    ]);

    expect(bootCalls).toBe(1);
    expect(first).not.toBe(second);
    expect(first.value).toBe(second.value);
    expect(supervisor.getGuardSnapshot().map(({ origin }) => origin)).toEqual([
      "connection-a",
      "connection-b",
    ]);
    first[Symbol.dispose]();
    first[Symbol.dispose]();
    expect(() => first.retain()).toThrow("disposed");
    expect(() => first.value).toThrow("disposed");
    expect(second.value.workspaceId).toBe(ws1);
    second[Symbol.dispose]();
    await supervisor.dispose();
  });

  it("retains independently and boots fresh after the last guard disposes", async () => {
    const runtimes: FakeRuntime[] = [];
    const supervisor = supervisorWithBoot((workspaceId) => {
      const runtime = new FakeRuntime(workspaceId);
      runtimes.push(runtime);
      return Promise.resolve(runtime);
    });

    const first = await supervisor.acquire(ws1);
    const second = first.retain("background");
    first[Symbol.dispose]();
    expect(runtimes[0]?.disposed).toBe(false);
    second[Symbol.dispose]();
    await vi.waitFor(() => {
      expect(runtimes[0]?.disposed).toBe(true);
    });

    const fresh = await supervisor.acquire(ws1);
    expect(runtimes).toHaveLength(2);
    fresh[Symbol.dispose]();
    await supervisor.dispose();
  });

  it("does not boot beside a workspace that failed to tear down", async () => {
    let bootCalls = 0;
    const runtime = new FakeRuntime(ws1);
    runtime.disposeError = new Error("workspace teardown failed");
    const supervisor = supervisorWithBoot(() => {
      bootCalls += 1;
      return Promise.resolve(runtime);
    });
    const guard = await supervisor.acquire(ws1);

    guard[Symbol.dispose]();

    await expect(supervisor.acquire(ws1)).rejects.toThrow(
      "workspace teardown failed",
    );
    expect(bootCalls).toBe(1);
    await expect(supervisor.dispose()).rejects.toThrow(
      "One or more workspaces failed to tear down",
    );
  });

  it("drops a failed workspace boot so a later acquire retries", async () => {
    let calls = 0;
    const supervisor = supervisorWithBoot((workspaceId) => {
      calls += 1;
      if (calls === 1) return Promise.reject(new Error("boot boom"));
      return Promise.resolve(new FakeRuntime(workspaceId));
    });

    await expect(supervisor.acquire(ws1)).rejects.toThrow("boot boom");
    const guard = await supervisor.acquire(ws1);
    expect(guard.value.workspaceId).toBe(ws1);
    expect(calls).toBe(2);
    guard[Symbol.dispose]();
    await supervisor.dispose();
  });

  it("drains attachment creation under its holder guard", async () => {
    const gate = deferred();
    const runtime = new FakeRuntime(ws1);
    runtime.attachmentGate = gate.promise;
    const supervisor = supervisorFor(runtime);
    const workspace = await supervisor.acquire(ws1);
    const creation = workspace.value.createAttachment({ sessionId: s1 });
    const disposal = supervisor.dispose();

    gate.resolve();
    const attachment = await creation;
    expect(runtime.disposed).toBe(false);

    attachment.dispose();
    workspace[Symbol.dispose]();
    await disposal;
    expect(runtime.agents.liveInstances).toBe(0);
  });

  it("stops admission and drains guards during parent disposal", async () => {
    const runtime = new FakeRuntime(ws1);
    const supervisor = supervisorFor(runtime);
    const guard = await supervisor.acquire(ws1);
    const disposal = supervisor.dispose();

    await expect(supervisor.acquire(ws1)).rejects.toThrow("disposed");
    expect(runtime.disposed).toBe(false);
    guard[Symbol.dispose]();

    await disposal;
    expect(runtime.disposed).toBe(true);
  });
});

describe("unified attachments", () => {
  it("shares one primary instance across several attachments", async () => {
    const runtime = new FakeRuntime(ws1);
    const supervisor = supervisorFor(runtime);
    const workspace = await supervisor.acquire(ws1);

    const a = await workspace.value.createAttachment({ sessionId: s1 });
    const b = await workspace.value.createAttachment({ sessionId: s1 });
    const c = await workspace.value.createAttachment({ sessionId: s1 });

    expect(a.target.sessionId).toBe(s1);
    expect(b.target.sessionId).toBe(s1);
    expect(c.target.sessionId).toBe(s1);
    expect(runtime.agents.creationCount).toBe(1);
    expect(runtime.agents.liveInstances).toBe(1);
    workspace[Symbol.dispose]();
    await supervisor.dispose();
  });

  it("retargets one attachment without moving its peers", async () => {
    const runtime = new FakeRuntime(ws1);
    const supervisor = supervisorFor(runtime);
    const workspace = await supervisor.acquire(ws1);
    const a = await workspace.value.createAttachment({ sessionId: s1 });
    const b = await workspace.value.createAttachment({ sessionId: s1 });

    await a.retarget({ sessionId: s2 });

    expect(a.target.sessionId).toBe(s2);
    expect(b.target.sessionId).toBe(s1);
    expect(runtime.agents.creationCount).toBe(2);
    workspace[Symbol.dispose]();
    await supervisor.dispose();
  });

  it("retargets away from and back to an independently guarded running instance", async () => {
    const runtime = new FakeRuntime(ws1);
    const supervisor = supervisorFor(runtime);
    const workspace = await supervisor.acquire(ws1);
    const attachment = await workspace.value.createAttachment({
      sessionId: s1,
    });
    const runningGuard = await runtime.agents.acquire(s1);

    await attachment.retarget({ sessionId: s2 });

    expect(runtime.agents.guardsFor(s1)).toBe(1);
    expect(attachment.target.sessionId).toBe(s2);
    await attachment.retarget({ sessionId: s1 });
    expect(runtime.agents.creationCount).toBe(2);
    expect(runtime.agents.guardsFor(s1)).toBe(2);

    runningGuard[Symbol.dispose]();
    expect(runtime.agents.guardsFor(s1)).toBe(1);
    workspace[Symbol.dispose]();
    await supervisor.dispose();
  });

  it("keeps the old target on failed retarget", async () => {
    const runtime = new FakeRuntime(ws1);
    const supervisor = supervisorFor(runtime);
    const workspace = await supervisor.acquire(ws1);
    const attachment = await workspace.value.createAttachment({
      sessionId: s1,
    });
    runtime.agents.failNextCreation(s2);

    await expect(attachment.retarget({ sessionId: s2 })).rejects.toThrow(
      "Creation failed",
    );
    expect(attachment.target.sessionId).toBe(s1);
    expect(runtime.agents.guardsFor(s1)).toBe(1);
    workspace[Symbol.dispose]();
    await supervisor.dispose();
  });

  it("closes one attachment without disturbing its peer", async () => {
    const runtime = new FakeRuntime(ws1);
    const supervisor = supervisorFor(runtime);
    const workspace = await supervisor.acquire(ws1);
    const a = await workspace.value.createAttachment({ sessionId: s1 });
    const b = await workspace.value.createAttachment({ sessionId: s1 });
    const ping = toChannelCanonicalId("chat", "ping");
    runtime.register(ping, () => "pong");

    a.dispose();
    a.dispose();

    expect(runtime.agents.guardsFor(s1)).toBe(1);
    expect(
      await dispatch(workspace, b, { channel: ping, payload: undefined }),
    ).toEqual({
      ok: true,
      value: "pong",
    });
    workspace[Symbol.dispose]();
    await supervisor.dispose();
  });

  it("delivers workspace and session events only to matching attachments", async () => {
    const runtime = new FakeRuntime(ws1);
    const supervisor = supervisorFor(runtime);
    const workspace = await supervisor.acquire(ws1);
    const a = await workspace.value.createAttachment({ sessionId: s1 });
    const b = await workspace.value.createAttachment({ sessionId: s1 });
    const c = await workspace.value.createAttachment({ sessionId: s2 });
    const received = new Map<string, string[]>();
    track(a, received);
    track(b, received);
    track(c, received);

    runtime.emit({ kind: "workspace" }, "workspace", {});
    runtime.emit({ kind: "session", sessionId: s1 }, "session-1", {});
    runtime.emit({ kind: "session", sessionId: s2 }, "session-2", {});

    expect(received.get(a.attachmentId)).toEqual(["workspace", "session-1"]);
    expect(received.get(b.attachmentId)).toEqual(["workspace", "session-1"]);
    expect(received.get(c.attachmentId)).toEqual(["workspace", "session-2"]);

    await a.retarget({ sessionId: s2 });
    runtime.emit({ kind: "session", sessionId: s1 }, "old-session", {});
    runtime.emit({ kind: "session", sessionId: s2 }, "new-session", {});

    expect(received.get(a.attachmentId)).toEqual([
      "workspace",
      "session-1",
      "new-session",
    ]);
    expect(received.get(b.attachmentId)).toEqual([
      "workspace",
      "session-1",
      "old-session",
    ]);
    expect(received.get(c.attachmentId)).toEqual([
      "workspace",
      "session-2",
      "new-session",
    ]);
    workspace[Symbol.dispose]();
    await supervisor.dispose();
  });

  it("keeps prepared context stable across retarget", async () => {
    const runtime = new FakeRuntime(ws1);
    const supervisor = supervisorFor(runtime);
    const workspace = await supervisor.acquire(ws1);
    const attachment = await workspace.value.createAttachment({
      sessionId: s1,
    });
    const contextChannel = toChannelCanonicalId("chat", "context");
    runtime.register(contextChannel, (_payload, context) => context.target);
    using prepared = attachment.prepareDispatch({
      channel: contextChannel,
      payload: {},
    });

    await attachment.retarget({ sessionId: s2 });
    expect(runtime.agents.guardsFor(s1)).toBe(1);
    const response = await prepared.invoke();

    expect(response).toEqual({ ok: true, value: { sessionId: s1 } });
    expect(runtime.agents.guardsFor(s1)).toBe(0);
    expect(attachment.target.sessionId).toBe(s2);
    workspace[Symbol.dispose]();
    await supervisor.dispose();
  });

  it("drains an admitted request after its connection closes", async () => {
    const runtime = new FakeRuntime(ws1);
    const supervisor = supervisorFor(runtime);
    const workspace = await supervisor.acquire(ws1);
    const attachment = await workspace.value.createAttachment({
      sessionId: s1,
    });
    const responseGate = deferred<string>();
    const ping = toChannelCanonicalId("chat", "ping");
    runtime.register(ping, () => responseGate.promise);

    const response = (async () => {
      using _workspaceOperationGuard = workspace.retain("dispatch");
      using prepared = attachment.prepareDispatch({
        channel: ping,
        payload: {},
      });
      return await prepared.invoke();
    })();
    const disposal = supervisor.dispose();
    attachment.dispose();
    workspace[Symbol.dispose]();

    expect(supervisor.getGuardSnapshot()).toEqual([
      expect.objectContaining({ origin: "dispatch", workspaceId: ws1 }),
    ]);
    expect(runtime.disposed).toBe(false);
    responseGate.resolve("pong");
    await expect(response).resolves.toEqual({ ok: true, value: "pong" });
    await disposal;
    expect(runtime.disposed).toBe(true);
  });

  it("keeps duplicate channel ids isolated across workspaces", async () => {
    const runtimeA = new FakeRuntime(ws1);
    const runtimeB = new FakeRuntime(ws2);
    const supervisor = supervisorWithBoot((workspaceId) =>
      Promise.resolve(workspaceId === ws1 ? runtimeA : runtimeB),
    );
    const workspaceA = await supervisor.acquire(ws1);
    const workspaceB = await supervisor.acquire(ws2);
    const a = await workspaceA.value.createAttachment({ sessionId: s1 });
    const b = await workspaceB.value.createAttachment({ sessionId: s1 });
    const ping = toChannelCanonicalId("chat", "ping");
    runtimeA.register(ping, () => "a");
    runtimeB.register(ping, () => "b");

    expect(
      await dispatch(workspaceA, a, { channel: ping, payload: undefined }),
    ).toEqual({
      ok: true,
      value: "a",
    });
    expect(
      await dispatch(workspaceB, b, { channel: ping, payload: undefined }),
    ).toEqual({
      ok: true,
      value: "b",
    });
    workspaceA[Symbol.dispose]();
    workspaceB[Symbol.dispose]();
    await supervisor.dispose();
  });
});
