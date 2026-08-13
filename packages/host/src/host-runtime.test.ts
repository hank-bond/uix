// In-memory proof of the host/runtime boundary: a fake runtime and fake
// agent manager exercise the supervisor, workspace handle, attachment, and
// scoped-event contracts described in docs/design/agent-session-routing.md.
// No Electron, WebSocket, HTTP, Pi, or feature loading. The scenarios prove
// single-flight boot, per-attachment session choice, scoped delivery with no
// broadcast, failed-target rollback, and disposal isolation.

import { describe, expect, it } from "vitest";

import { toChannelCanonicalId } from "@uix/api/channel-resolution";
import type {
  AgentInstanceId,
  AttachmentContext,
  AttachmentId,
  CanonicalRequest,
  CanonicalResponse,
  EventScope,
  RuntimeAttachment,
  RuntimeEvent,
  SessionId,
  SessionTarget,
  WorkspaceId,
} from "@uix/runtime";
import type {
  ActivationResult,
  ReloadResult,
  WorkspaceRuntime,
} from "@uix/runtime";
import {
  toAgentInstanceId,
  toAttachmentId,
  toSessionId,
  toWorkspaceId,
} from "@uix/runtime";

import type { Attachment } from "./attachment";
import { Supervisor } from "./supervisor";

type Handler = (payload: unknown, context: AttachmentContext) => unknown;

/** One primary agent instance per session, with reference counting. */
class FakeAgentManager {
  readonly #instances = new Map<
    SessionId,
    { instanceId: AgentInstanceId; refs: number }
  >();
  readonly #failNextBoot = new Set<SessionId>();
  #next = 0;
  bootCount = 0;

  failNext(sessionId: SessionId): void {
    this.#failNextBoot.add(sessionId);
  }

  boot(sessionId: SessionId): Promise<AgentInstanceId> {
    const existing = this.#instances.get(sessionId);
    if (existing) {
      existing.refs += 1;
      return Promise.resolve(existing.instanceId);
    }
    if (this.#failNextBoot.delete(sessionId)) {
      return Promise.reject(new Error(`Boot failed for session ${sessionId}`));
    }
    this.bootCount += 1;
    this.#next += 1;
    const instanceId = toAgentInstanceId(`instance-${String(this.#next)}`);
    this.#instances.set(sessionId, { instanceId, refs: 1 });
    return Promise.resolve(instanceId);
  }

  release(sessionId: SessionId): void {
    const entry = this.#instances.get(sessionId);
    if (!entry) return;
    entry.refs -= 1;
    if (entry.refs === 0) this.#instances.delete(sessionId);
  }

  refsFor(sessionId: SessionId): number {
    return this.#instances.get(sessionId)?.refs ?? 0;
  }

  get liveInstances(): number {
    return this.#instances.size;
  }
}

class FakeRuntimeAttachment implements RuntimeAttachment {
  readonly attachmentId: AttachmentId;
  readonly workspaceId: WorkspaceId;
  sessionId: SessionId;
  instanceId: AgentInstanceId;
  disposed = false;

  constructor(
    readonly runtime: FakeRuntime,
    attachmentId: AttachmentId,
    sessionId: SessionId,
    instanceId: AgentInstanceId,
  ) {
    this.attachmentId = attachmentId;
    this.workspaceId = runtime.workspaceId;
    this.sessionId = sessionId;
    this.instanceId = instanceId;
  }

  dispatch(request: CanonicalRequest): Promise<CanonicalResponse> {
    if (this.disposed) {
      return Promise.resolve({
        ok: false,
        error: { code: "disposed", message: "Attachment disposed" },
      });
    }
    const handler = this.runtime.handlers.get(request.channel);
    if (!handler) {
      return Promise.resolve({
        ok: false,
        error: {
          code: "unknown_channel",
          message: `Unknown channel ${request.channel}`,
        },
      });
    }
    try {
      return Promise.resolve({
        ok: true,
        value: handler(request.payload, {
          workspaceId: this.workspaceId,
          attachmentId: this.attachmentId,
          sessionId: this.sessionId,
        }),
      });
    } catch (error) {
      return Promise.resolve({
        ok: false,
        error: {
          code: "handler_error",
          message: error instanceof Error ? error.message : String(error),
        },
      });
    }
  }

  async retarget(target: SessionTarget): Promise<void> {
    const next = await this.runtime.agents.boot(target.sessionId);
    this.runtime.agents.release(this.sessionId);
    this.sessionId = target.sessionId;
    this.instanceId = next;
  }

  dispose(): Promise<void> {
    if (this.disposed) return Promise.resolve();
    this.disposed = true;
    this.runtime.agents.release(this.sessionId);
    return Promise.resolve();
  }
}

class FakeRuntime implements WorkspaceRuntime {
  readonly workspaceId: WorkspaceId;
  readonly agents = new FakeAgentManager();
  readonly handlers = new Map<string, Handler>();
  readonly #listeners = new Set<(event: RuntimeEvent) => void>();
  #nextAttachment = 0;
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
      [Symbol.dispose]: () => {
        this.#listeners.delete(listener);
      },
    };
  }

  /** Test-only: publish one scoped runtime event as a feature would. */
  emit(scope: EventScope, id: string, payload: unknown): void {
    const event: RuntimeEvent = { id, scope, payload };
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

  [Symbol.dispose](): void {
    void this.dispose();
  }

  async createAttachment(target?: SessionTarget): Promise<RuntimeAttachment> {
    const acceptedTarget = target ?? { sessionId: s1 };
    const instanceId = await this.agents.boot(acceptedTarget.sessionId);
    this.#nextAttachment += 1;
    return new FakeRuntimeAttachment(
      this,
      toAttachmentId(`attachment-${String(this.#nextAttachment)}`),
      acceptedTarget.sessionId,
      instanceId,
    );
  }

  dispose(): Promise<void> {
    this.disposed = true;
    this.#listeners.clear();
    return Promise.resolve();
  }
}

/** Record the routed events an attachment receives. */
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
): Supervisor {
  return new Supervisor({ boot });
}

function supervisorFor(runtime: FakeRuntime): Supervisor {
  return new Supervisor({ boot: () => Promise.resolve(runtime) });
}

describe("supervisor", () => {
  it("boots a workspace single-flight under concurrent acquires", async () => {
    let bootCalls = 0;
    const supervisor = supervisorWithBoot((workspaceId) => {
      bootCalls += 1;
      return Promise.resolve(new FakeRuntime(workspaceId));
    });

    const [first, second] = await Promise.all([
      supervisor.acquire(ws1),
      supervisor.acquire(ws1),
    ]);

    expect(bootCalls).toBe(1);
    expect(first).toBe(second);

    await supervisor.dispose();
  });

  it("retains a workspace until the last release, then tears down and re-boots fresh", async () => {
    let runtime: FakeRuntime | undefined;
    const supervisor = supervisorWithBoot((workspaceId) => {
      const created = new FakeRuntime(workspaceId);
      runtime = created;
      return Promise.resolve(created);
    });

    await supervisor.acquire(ws1);
    await supervisor.acquire(ws1);
    await supervisor.release(ws1);
    expect(runtime?.disposed).toBe(false);

    await supervisor.release(ws1);
    expect(runtime?.disposed).toBe(true);

    await supervisor.acquire(ws1);
    expect(runtime?.disposed).toBe(false);

    await supervisor.dispose();
  });

  it("disposes every retained workspace on supervisor dispose", async () => {
    const runtimes: FakeRuntime[] = [];
    const supervisor = supervisorWithBoot((workspaceId) => {
      const runtime = new FakeRuntime(workspaceId);
      runtimes.push(runtime);
      return Promise.resolve(runtime);
    });

    await supervisor.acquire(ws1);
    await supervisor.acquire(ws2);
    await supervisor.dispose();

    expect(runtimes.map((runtime) => runtime.disposed)).toEqual([true, true]);
  });

  it("drops a failed workspace boot so a later acquire retries", async () => {
    let calls = 0;
    const supervisor = supervisorWithBoot((workspaceId) => {
      calls += 1;
      if (calls === 1) return Promise.reject(new Error("boot boom"));
      return Promise.resolve(new FakeRuntime(workspaceId));
    });

    await expect(supervisor.acquire(ws1)).rejects.toThrow("boot boom");
    const handle = await supervisor.acquire(ws1);
    expect(calls).toBe(2);
    expect(handle.workspaceId).toBe(ws1);

    await supervisor.dispose();
  });
});

describe("attachments", () => {
  it("resolve several attachments on one session to the same primary instance", async () => {
    const runtime = new FakeRuntime(ws1);
    const supervisor = supervisorFor(runtime);
    const handle = await supervisor.acquire(ws1);

    const a = await handle.createAttachment({ sessionId: s1 });
    const b = await handle.createAttachment({ sessionId: s1 });
    const c = await handle.createAttachment({ sessionId: s1 });

    expect(a.instanceId).toBe(b.instanceId);
    expect(b.instanceId).toBe(c.instanceId);
    expect(runtime.agents.bootCount).toBe(1);
    expect(runtime.agents.liveInstances).toBe(1);

    await supervisor.dispose();
  });

  it("retarget one attachment without moving its peers", async () => {
    const runtime = new FakeRuntime(ws1);
    const supervisor = supervisorFor(runtime);
    const handle = await supervisor.acquire(ws1);

    const a = await handle.createAttachment({ sessionId: s1 });
    const b = await handle.createAttachment({ sessionId: s1 });
    const instanceS1 = a.instanceId;

    await a.retarget({ sessionId: s2 });

    expect(a.sessionId).toBe(s2);
    expect(a.instanceId).not.toBe(instanceS1);
    expect(b.sessionId).toBe(s1);
    expect(b.instanceId).toBe(instanceS1);
    expect(runtime.agents.bootCount).toBe(2);

    await supervisor.dispose();
  });

  it("keeps the old target on a failed retarget", async () => {
    const runtime = new FakeRuntime(ws1);
    const supervisor = supervisorFor(runtime);
    const handle = await supervisor.acquire(ws1);

    const a = await handle.createAttachment({ sessionId: s1 });
    const oldSession = a.sessionId;
    const oldInstance = a.instanceId;
    runtime.agents.failNext(s2);

    await expect(a.retarget({ sessionId: s2 })).rejects.toThrow("Boot failed");
    expect(a.sessionId).toBe(oldSession);
    expect(a.instanceId).toBe(oldInstance);
    expect(runtime.agents.refsFor(s1)).toBe(1);

    await supervisor.dispose();
  });

  it("disposes one attachment without disturbing its peers or workspace", async () => {
    const runtime = new FakeRuntime(ws1);
    const supervisor = supervisorFor(runtime);
    const handle = await supervisor.acquire(ws1);

    const a = await handle.createAttachment({ sessionId: s1 });
    const b = await handle.createAttachment({ sessionId: s1 });
    const chat = toChannelCanonicalId("chat", "ping");
    runtime.register(chat, () => "pong");

    await a.dispose();
    await a.dispose(); // idempotent

    expect(runtime.agents.refsFor(s1)).toBe(1);
    expect(await b.dispatch({ channel: chat, payload: undefined })).toEqual({
      ok: true,
      value: "pong",
    });

    await supervisor.dispose();
  });
});

describe("scoped event delivery", () => {
  it("delivers workspace, session, and agent-instance events only to matching attachments", async () => {
    const runtime = new FakeRuntime(ws1);
    const supervisor = supervisorFor(runtime);
    const handle = await supervisor.acquire(ws1);

    const a = await handle.createAttachment({ sessionId: s1 });
    const b = await handle.createAttachment({ sessionId: s1 });
    const c = await handle.createAttachment({ sessionId: s2 });
    const instanceS1 = a.instanceId;
    const instanceS2 = c.instanceId;

    const received = new Map<string, string[]>();
    track(a, received);
    track(b, received);
    track(c, received);

    runtime.emit({ kind: "workspace" }, "ev-workspace", {});
    runtime.emit({ kind: "session", sessionId: s1 }, "ev-session-1", {});
    runtime.emit({ kind: "session", sessionId: s2 }, "ev-session-2", {});
    runtime.emit(
      { kind: "agent-instance", instanceId: instanceS1 },
      "ev-instance-1",
      {},
    );
    runtime.emit(
      { kind: "agent-instance", instanceId: instanceS2 },
      "ev-instance-2",
      {},
    );

    expect(received.get(a.attachmentId)).toEqual([
      "ev-workspace",
      "ev-session-1",
      "ev-instance-1",
    ]);
    expect(received.get(b.attachmentId)).toEqual([
      "ev-workspace",
      "ev-session-1",
      "ev-instance-1",
    ]);
    expect(received.get(c.attachmentId)).toEqual([
      "ev-workspace",
      "ev-session-2",
      "ev-instance-2",
    ]);

    await supervisor.dispose();
  });

  it("never crosses into another workspace", async () => {
    const runtimeA = new FakeRuntime(ws1);
    const runtimeB = new FakeRuntime(ws2);
    const supervisor = supervisorWithBoot((workspaceId) =>
      Promise.resolve(workspaceId === ws1 ? runtimeA : runtimeB),
    );
    const handleA = await supervisor.acquire(ws1);
    const handleB = await supervisor.acquire(ws2);

    const a = await handleA.createAttachment({ sessionId: s1 });
    const d = await handleB.createAttachment({ sessionId: s1 });

    const receivedA = new Map<string, string[]>();
    const receivedB = new Map<string, string[]>();
    track(a, receivedA);
    track(d, receivedB);

    runtimeA.emit({ kind: "workspace" }, "ev-a", {});

    expect(receivedA.get(a.attachmentId)).toEqual(["ev-a"]);
    expect(receivedB.has(d.attachmentId)).toBe(false);

    await supervisor.dispose();
  });
});

describe("workspace isolation", () => {
  function pairSupervisor(
    runtimeA: FakeRuntime,
    runtimeB: FakeRuntime,
  ): Supervisor {
    return new Supervisor({
      boot: (workspaceId) =>
        Promise.resolve(workspaceId === ws1 ? runtimeA : runtimeB),
    });
  }

  it("keeps identical canonical ids and handlers isolated across workspaces", async () => {
    const runtimeA = new FakeRuntime(ws1);
    const runtimeB = new FakeRuntime(ws2);
    const supervisor = pairSupervisor(runtimeA, runtimeB);
    const handleA = await supervisor.acquire(ws1);
    const handleB = await supervisor.acquire(ws2);

    const a = await handleA.createAttachment({ sessionId: s1 });
    const d = await handleB.createAttachment({ sessionId: s1 });

    // Both workspaces register the same canonical channel id with different behavior.
    const chat = toChannelCanonicalId("chat", "send");
    runtimeA.register(chat, (payload) => `a:${String(payload)}`);
    runtimeB.register(chat, (payload) => `b:${String(payload)}`);

    expect(await a.dispatch({ channel: chat, payload: "hi" })).toEqual({
      ok: true,
      value: "a:hi",
    });
    expect(await d.dispatch({ channel: chat, payload: "hi" })).toEqual({
      ok: true,
      value: "b:hi",
    });

    // Unknown channels error explicitly and stay local.
    const unknown = toChannelCanonicalId("chat", "missing");
    expect(await a.dispatch({ channel: unknown, payload: undefined })).toEqual({
      ok: false,
      error: { code: "unknown_channel", message: `Unknown channel ${unknown}` },
    });

    await supervisor.dispose();
  });

  it("stamps accepted attachment context outside feature payloads", async () => {
    const runtime = new FakeRuntime(ws1);
    const supervisor = supervisorFor(runtime);
    const handle = await supervisor.acquire(ws1);

    const a = await handle.createAttachment({ sessionId: s1 });
    const contextChannel = toChannelCanonicalId("chat", "context");
    runtime.register(contextChannel, (_payload, context) => context);

    const response = await a.dispatch({ channel: contextChannel, payload: {} });
    expect(response).toEqual({
      ok: true,
      value: {
        workspaceId: ws1,
        attachmentId: a.attachmentId,
        sessionId: s1,
      },
    });

    await supervisor.dispose();
  });

  it("disposes one workspace without touching the other", async () => {
    const runtimeA = new FakeRuntime(ws1);
    const runtimeB = new FakeRuntime(ws2);
    const supervisor = pairSupervisor(runtimeA, runtimeB);
    const handleA = await supervisor.acquire(ws1);
    const handleB = await supervisor.acquire(ws2);

    const a = await handleA.createAttachment({ sessionId: s1 });
    const d = await handleB.createAttachment({ sessionId: s1 });
    const chat = toChannelCanonicalId("chat", "ping");
    runtimeA.register(chat, () => "a-pong");
    runtimeB.register(chat, () => "b-pong");

    await handleA.dispose();

    expect(runtimeA.disposed).toBe(true);
    expect(runtimeB.disposed).toBe(false);
    await expect(
      a.dispatch({ channel: chat, payload: undefined }),
    ).rejects.toThrow("disposed");
    expect(await d.dispatch({ channel: chat, payload: undefined })).toEqual({
      ok: true,
      value: "b-pong",
    });

    await supervisor.dispose();
  });
});
