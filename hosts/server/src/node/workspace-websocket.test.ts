import { EventEmitter } from "node:events";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const wireLog = vi.hoisted(() => ({
  debug: vi.fn(),
  error: vi.fn(),
}));
vi.mock("@uix/runtime/log", () => ({
  createLogger: () => wireLog,
}));

import type {
  Attachment,
  CanonicalRequest,
  CanonicalResponse,
  PreparedDispatch,
  RuntimeEvent,
} from "@uix/runtime";
import { toAttachmentId, toSessionId, toWorkspaceId } from "@uix/runtime";

import { bindWorkspaceWebSocket } from "./workspace-websocket";

class FakeSocket extends EventEmitter {
  readonly OPEN = 1;
  readonly send = vi.fn<(data: string) => void>();
  readonly ping = vi.fn<() => void>();
  readonly terminate = vi.fn<() => void>();
  readyState = this.OPEN;

  emitMessage(value: unknown): void {
    this.emit("message", JSON.stringify(value), false);
  }
}

function createDeferred<T>(): {
  readonly promise: Promise<T>;
  resolve(value: T): void;
} {
  let resolve!: (value: T) => void;
  return {
    promise: new Promise<T>((resolvePromise) => {
      resolve = resolvePromise;
    }),
    resolve,
  };
}

function createAttachmentFixture(
  prepareDispatch: (request: CanonicalRequest) => PreparedDispatch,
): {
  readonly attachment: Attachment;
  emit(event: RuntimeEvent): void;
} {
  let eventListener: ((event: RuntimeEvent) => void) | undefined;
  return {
    attachment: {
      attachmentId: toAttachmentId("attachment-1"),
      workspaceId: toWorkspaceId("reference"),
      target: { sessionId: toSessionId("session-1") },
      prepareDispatch,
      retarget: () => Promise.reject(new Error("Unexpected retarget")),
      onEvent(listener) {
        eventListener = listener;
        return {
          [Symbol.dispose](): void {
            if (eventListener === listener) eventListener = undefined;
          },
        };
      },
      onClose: () => ({ [Symbol.dispose]: () => undefined }),
      [Symbol.dispose]: () => undefined,
    },
    emit(event): void {
      eventListener?.(event);
    },
  };
}

function createPreparedDispatch(
  request: CanonicalRequest,
  invoke: () => Promise<CanonicalResponse>,
  disposal = vi.fn(),
): PreparedDispatch {
  return {
    request,
    logOptions: {},
    invoke,
    [Symbol.asyncDispose]: () => {
      disposal();
      return Promise.resolve();
    },
  };
}

function parseSentMessages(socket: FakeSocket): unknown[] {
  return socket.send.mock.calls.map(([value]) => JSON.parse(value) as unknown);
}

async function waitForTasks(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe("server workspace WebSocket binding", () => {
  beforeEach(() => {
    wireLog.debug.mockClear();
    wireLog.error.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("pings live connections and terminates one that stops answering", () => {
    vi.useFakeTimers();
    const fixture = createAttachmentFixture(() => {
      throw new Error("Unexpected dispatch");
    });
    const socket = new FakeSocket();
    using _binding = bindWorkspaceWebSocket(
      socket as never,
      fixture.attachment,
      {
        type: "ready",
        sessionId: "session-1",
        canonicalPath: "/workspaces/reference/sessions/session-1",
      },
    );

    vi.advanceTimersByTime(30_000);
    expect(socket.ping).toHaveBeenCalledOnce();
    socket.emit("pong");
    vi.advanceTimersByTime(30_000);
    expect(socket.ping).toHaveBeenCalledTimes(2);
    vi.advanceTimersByTime(30_000);
    expect(socket.terminate).toHaveBeenCalledOnce();
  });

  it("prepares canonical requests and returns one correlated terminal message", async () => {
    const prepare = vi.fn((request: CanonicalRequest) =>
      createPreparedDispatch(request, () =>
        Promise.resolve({ ok: true, value: { echoed: request.payload } }),
      ),
    );
    const fixture = createAttachmentFixture(prepare);
    const socket = new FakeSocket();
    using _binding = bindWorkspaceWebSocket(
      socket as never,
      fixture.attachment,
      {
        type: "ready",
        sessionId: "session-1",
        canonicalPath: "/workspaces/reference/sessions/session-1",
      },
    );

    socket.emitMessage({
      type: "request",
      id: "correlation-1",
      channel: "feature.echo",
      payload: { value: 1 },
    });
    await waitForTasks();

    expect(prepare).toHaveBeenCalledWith({
      channel: "feature.echo",
      payload: { value: 1 },
    });
    expect(parseSentMessages(socket)).toEqual([
      {
        type: "ready",
        sessionId: "session-1",
        canonicalPath: "/workspaces/reference/sessions/session-1",
      },
      {
        type: "response",
        id: "correlation-1",
        value: { echoed: { value: 1 } },
      },
    ]);
  });

  it("rejects duplicate in-flight correlation without disturbing the original", async () => {
    const result = createDeferred<CanonicalResponse>();
    const disposal = vi.fn();
    const prepare = vi.fn((request: CanonicalRequest) =>
      createPreparedDispatch(request, () => result.promise, disposal),
    );
    const fixture = createAttachmentFixture(prepare);
    const socket = new FakeSocket();
    using _binding = bindWorkspaceWebSocket(
      socket as never,
      fixture.attachment,
      {
        type: "ready",
        sessionId: "session-1",
        canonicalPath: "/workspaces/reference/sessions/session-1",
      },
    );
    const request = {
      type: "request",
      id: "same-id",
      channel: "feature.wait",
      payload: {},
    };

    socket.emitMessage(request);
    socket.emitMessage(request);
    expect(prepare).toHaveBeenCalledOnce();
    expect(parseSentMessages(socket).at(-1)).toEqual({
      type: "error",
      id: "same-id",
      code: "correlation_in_use",
      message: "Correlation id is already in use: same-id",
      isTerminal: false,
    });

    result.resolve({ ok: true, value: "original-result" });
    await waitForTasks();
    expect(parseSentMessages(socket).at(-1)).toEqual({
      type: "response",
      id: "same-id",
      value: "original-result",
    });
    expect(disposal).toHaveBeenCalledOnce();
  });

  it("keeps malformed messages out of dispatch and omits invalid payloads from errors", () => {
    const prepare = vi.fn();
    const fixture = createAttachmentFixture(prepare);
    const socket = new FakeSocket();
    using _binding = bindWorkspaceWebSocket(
      socket as never,
      fixture.attachment,
      {
        type: "ready",
        sessionId: "session-1",
        canonicalPath: "/workspaces/reference/sessions/session-1",
      },
    );

    socket.emitMessage({
      type: "request",
      id: "safe-id",
      channel: "not canonical",
      payload: { secret: "must-not-echo" },
    });

    expect(prepare).not.toHaveBeenCalled();
    expect(parseSentMessages(socket).at(-1)).toEqual({
      type: "error",
      id: "safe-id",
      code: "malformed_message",
      message: "Invalid WebSocket request message",
      isTerminal: false,
    });
    expect(JSON.stringify(parseSentMessages(socket).at(-1))).not.toContain(
      "must-not-echo",
    );
  });

  it("uses a prepared unknown channel's payload-omitting wire-log policy", async () => {
    const fixture = createAttachmentFixture((request) => ({
      request,
      logOptions: {
        describeRequest: () => ({ channel: request.channel }),
      },
      invoke: () =>
        Promise.resolve({
          ok: false,
          error: {
            code: "unknown_channel",
            message: `Unknown channel ${request.channel}`,
          },
        }),
      [Symbol.asyncDispose]: () => Promise.resolve(),
    }));
    const socket = new FakeSocket();
    using _binding = bindWorkspaceWebSocket(
      socket as never,
      fixture.attachment,
      {
        type: "ready",
        sessionId: "session-1",
        canonicalPath: "/workspaces/reference/sessions/session-1",
      },
    );

    socket.emitMessage({
      type: "request",
      id: "request-1",
      channel: "missing.channel",
      payload: { secret: "must-not-log" },
    });
    await waitForTasks();

    expect(wireLog.debug).toHaveBeenCalledWith(
      { payload: { channel: "missing.channel" } },
      "in:missing.channel",
    );
    expect(JSON.stringify(wireLog.debug.mock.calls)).not.toContain(
      "must-not-log",
    );
  });

  it("forwards only attachment-delivered event identity, channel, and payload", () => {
    const fixture = createAttachmentFixture(() => {
      throw new Error("Unexpected dispatch");
    });
    const socket = new FakeSocket();
    using _binding = bindWorkspaceWebSocket(
      socket as never,
      fixture.attachment,
      {
        type: "ready",
        sessionId: "session-1",
        canonicalPath: "/workspaces/reference/sessions/session-1",
      },
    );

    fixture.emit({
      id: "event-1",
      channel: "feature.changed" as never,
      scope: { kind: "session", sessionId: toSessionId("session-1") },
      payload: { revision: 3 },
    });

    expect(parseSentMessages(socket).at(-1)).toEqual({
      type: "event",
      id: "event-1",
      channel: "feature.changed",
      payload: { revision: 3 },
    });
    expect(parseSentMessages(socket).at(-1)).not.toHaveProperty("scope");
    expect(parseSentMessages(socket).at(-1)).not.toHaveProperty("sessionId");
  });

  it("lets accepted work finish after physical disconnect", async () => {
    const result = createDeferred<CanonicalResponse>();
    const disposal = vi.fn();
    const fixture = createAttachmentFixture((request) =>
      createPreparedDispatch(request, () => result.promise, disposal),
    );
    const socket = new FakeSocket();
    const binding = bindWorkspaceWebSocket(
      socket as never,
      fixture.attachment,
      {
        type: "ready",
        sessionId: "session-1",
        canonicalPath: "/workspaces/reference/sessions/session-1",
      },
    );

    socket.emitMessage({
      type: "request",
      id: "request-1",
      channel: "feature.wait",
    });
    socket.readyState = 3;
    binding[Symbol.dispose]();
    result.resolve({ ok: true, value: "finished" });
    await waitForTasks();

    expect(disposal).toHaveBeenCalledOnce();
    expect(socket.send).toHaveBeenCalledOnce();
  });
});
