import { Buffer } from "node:buffer";
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

import {
  bindWorkspaceWebSocket,
  bindWorkspaceWebSocketMessageRejection,
} from "./workspace-websocket";

class FakeSocket extends EventEmitter {
  readonly OPEN = 1;
  readonly send = vi.fn<(data: string) => void>();
  readonly close = vi.fn<(code: number, reason: string) => void>();
  readonly ping = vi.fn<() => void>();
  readonly terminate = vi.fn<() => void>();
  readyState = this.OPEN;

  emitMessage(value: unknown): void {
    this.emit("message", JSON.stringify(value), false);
  }

  emitEncodedMessage(value: unknown, isBinary: boolean): void {
    this.emit("message", value, isBinary);
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
  replaceBinding(binding: string): void;
} {
  let eventListener: ((event: RuntimeEvent) => void) | undefined;
  let bindingListener:
    | ((binding: Attachment["webBinding"]) => void)
    | undefined;
  return {
    attachment: {
      attachmentId: toAttachmentId("attachment-1"),
      workspaceId: toWorkspaceId("reference"),
      target: { sessionId: toSessionId("session-1") },
      webBinding: "fixture-binding" as Attachment["webBinding"],
      prepareDispatch,
      retarget: () => Promise.reject(new Error("Unexpected retarget")),
      onWebBindingChange(listener) {
        bindingListener = listener;
        return {
          [Symbol.dispose]: () => {
            bindingListener = undefined;
          },
        };
      },
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
    replaceBinding(binding): void {
      bindingListener?.(binding as Attachment["webBinding"]);
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

  it("derives the initial message and canonical path from the accepted attachment", () => {
    const fixture = createAttachmentFixture(() => {
      throw new Error("Unexpected dispatch");
    });
    const socket = new FakeSocket();
    using _binding = bindWorkspaceWebSocket(socket as never, {
      ...fixture.attachment,
      workspaceId: toWorkspaceId("other-workspace"),
      target: { sessionId: toSessionId("session/2") },
    });
    expect(parseSentMessages(socket)).toEqual([
      {
        type: "ready",
        webBinding: fixture.attachment.webBinding,
        sessionId: "session/2",
        canonicalPath: "/workspaces/other-workspace/sessions/session%2F2",
      },
    ]);
  });

  it("orders host binding updates before target events and disposes both subscriptions", () => {
    const fixture = createAttachmentFixture(() => {
      throw new Error("Unexpected dispatch");
    });
    const socket = new FakeSocket();
    using binding = bindWorkspaceWebSocket(socket as never, fixture.attachment);
    fixture.replaceBinding("next-binding");
    const event: RuntimeEvent = {
      id: "e1",
      payload: undefined,
      channel: "feature.changed" as never,
      scope: { kind: "session", sessionId: toSessionId("session-2") },
    };
    fixture.emit(event);
    expect(parseSentMessages(socket)).toEqual([
      {
        type: "ready",
        sessionId: "session-1",
        canonicalPath: "/workspaces/reference/sessions/session-1",
        webBinding: "fixture-binding",
      },
      { type: "web_binding", binding: "next-binding" },
      { type: "event", id: "e1", channel: "feature.changed" },
    ]);
    binding[Symbol.dispose]();
    binding[Symbol.dispose]();
    fixture.replaceBinding("closed-binding");
    fixture.emit(event);
    expect(socket.send).toHaveBeenCalledTimes(3);
    expect(socket.listenerCount("message")).toBe(0);
    expect(socket.listenerCount("pong")).toBe(0);
  });

  it("stops delivery and completes cleanup when a binding subscription fails to dispose", () => {
    const fixture = createAttachmentFixture(() => {
      throw new Error("Unexpected dispatch");
    });
    const socket = new FakeSocket();
    using binding = bindWorkspaceWebSocket(socket as never, {
      ...fixture.attachment,
      onWebBindingChange(listener) {
        const subscription = fixture.attachment.onWebBindingChange(listener);
        return {
          [Symbol.dispose]() {
            subscription[Symbol.dispose]();
            listener(fixture.attachment.webBinding);
            throw new Error("Unsubscribe failed");
          },
        };
      },
    });
    expect(() => {
      binding[Symbol.dispose]();
    }).toThrow("Unsubscribe failed");
    fixture.emit({
      id: "e1",
      payload: undefined,
      channel: "feature.changed" as never,
      scope: { kind: "session", sessionId: toSessionId("session-1") },
    });
    expect(socket.send).toHaveBeenCalledOnce();
    expect(socket.listenerCount("message")).toBe(0);
    expect(socket.listenerCount("pong")).toBe(0);
    binding[Symbol.dispose]();
  });

  it("rolls back subscriptions and heartbeat if initial delivery fails", () => {
    const fixture = createAttachmentFixture(() => {
      throw new Error("Unexpected dispatch");
    });
    const socket = new FakeSocket();
    socket.send.mockImplementationOnce(() => {
      throw new Error("Send failed");
    });
    expect(() =>
      bindWorkspaceWebSocket(socket as never, fixture.attachment),
    ).toThrow("Send failed");
    fixture.replaceBinding("later");
    fixture.emit({
      id: "e1",
      payload: undefined,
      channel: "feature.changed" as never,
      scope: { kind: "session", sessionId: toSessionId("session-1") },
    });
    expect(socket.send).toHaveBeenCalledOnce();
    expect(socket.listenerCount("message")).toBe(0);
    expect(socket.listenerCount("pong")).toBe(0);
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
        webBinding: "fixture-binding",
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

  it("keeps malformed messages out of dispatch and logs only an independently valid id", () => {
    const prepare = vi.fn();
    const fixture = createAttachmentFixture(prepare);
    const socket = new FakeSocket();
    using _binding = bindWorkspaceWebSocket(
      socket as never,
      fixture.attachment,
    );

    socket.emitMessage({
      type: "request",
      id: "safe-id",
      channel: "not canonical",
      payload: { secret: "must-not-echo-or-log" },
    });

    expect(prepare).not.toHaveBeenCalled();
    expect(parseSentMessages(socket).at(-1)).toEqual({
      type: "error",
      id: "safe-id",
      code: "malformed_message",
      message: "Invalid WebSocket request message",
      isTerminal: false,
    });
    expect(wireLog.debug).toHaveBeenCalledWith(
      {
        payload: {
          correlationId: "safe-id",
          redacted: "payload omitted before dispatch preparation",
        },
      },
      "in:invalid",
    );
    expect(JSON.stringify(wireLog.debug.mock.calls)).not.toContain(
      "must-not-echo-or-log",
    );
  });

  it("logs binary messages through the malformed payload-omitting boundary", () => {
    const prepare = vi.fn();
    const fixture = createAttachmentFixture(prepare);
    const socket = new FakeSocket();
    using _binding = bindWorkspaceWebSocket(
      socket as never,
      fixture.attachment,
    );

    socket.emitEncodedMessage(
      Buffer.from('{"id":"unsafe-id","payload":"binary-secret"}'),
      true,
    );

    expect(prepare).not.toHaveBeenCalled();
    expect(parseSentMessages(socket).at(-1)).toEqual({
      type: "error",
      code: "malformed_message",
      message: "WebSocket messages must be JSON text",
      isTerminal: false,
    });
    expect(wireLog.debug).toHaveBeenCalledWith(
      {
        payload: {
          redacted: "payload omitted before dispatch preparation",
        },
      },
      "in:invalid",
    );
    expect(JSON.stringify(wireLog.debug.mock.calls)).not.toContain(
      "binary-secret",
    );
    expect(JSON.stringify(wireLog.debug.mock.calls)).not.toContain("unsafe-id");
  });

  it("logs and rejects pre-ready messages without accepting their payload", () => {
    const socket = new FakeSocket();
    using _messageRejection = bindWorkspaceWebSocketMessageRejection(
      socket as never,
    );

    socket.emitEncodedMessage(
      Buffer.from(
        JSON.stringify({
          type: "request",
          id: "safe-id",
          channel: "feature.echo",
          payload: { secret: "pre-ready-secret" },
        }),
      ),
      false,
    );

    expect(socket.close).toHaveBeenCalledWith(
      1002,
      "WebSocket connection is not ready",
    );
    expect(wireLog.debug).toHaveBeenCalledWith(
      {
        payload: {
          correlationId: "safe-id",
          redacted: "payload omitted before dispatch preparation",
        },
      },
      "in:invalid",
    );
    expect(JSON.stringify(wireLog.debug.mock.calls)).not.toContain(
      "pre-ready-secret",
    );
    expect(JSON.stringify(wireLog.debug.mock.calls)).not.toContain(
      "feature.echo",
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
    const binding = bindWorkspaceWebSocket(socket as never, fixture.attachment);

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
