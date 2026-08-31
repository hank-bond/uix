import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createWorkspaceWebSocketAdapter,
  type WebSocketRequestError,
} from "./workspace-websocket-adapter";

class FakeWebSocket {
  static readonly OPEN = 1;

  readonly send = vi.fn<(data: string) => void>();
  readyState = FakeWebSocket.OPEN;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("workspace WebSocket adapter", () => {
  it("correlates terminal success and failure without physical target fields", async () => {
    vi.stubGlobal("WebSocket", FakeWebSocket);
    const socket = new FakeWebSocket();
    const adapter = createWorkspaceWebSocketAdapter(
      socket as unknown as WebSocket,
      "reference",
      (url) => `https://uix.example/content?url=${encodeURIComponent(url)}`,
    );

    expect(
      adapter.client.resolveResourceUrl?.(
        "uix-resource://reference/reports/document",
      ),
    ).toBe(
      "https://uix.example/content?url=uix-resource%3A%2F%2Freference%2Freports%2Fdocument",
    );

    const success = adapter.client.request("feature.read", { value: 1 });
    const sent = JSON.parse(socket.send.mock.calls[0]?.[0] ?? "") as Record<
      string,
      unknown
    >;
    expect(sent).toEqual({
      type: "request",
      id: "request-1",
      channel: "feature.read",
      payload: { value: 1 },
    });
    expect(sent).not.toHaveProperty("workspaceId");
    expect(sent).not.toHaveProperty("sessionId");

    adapter.messageHandler(
      {
        type: "response",
        id: "request-1",
        value: { accepted: true },
      },
      socket as unknown as WebSocket,
    );
    await expect(success).resolves.toEqual({ accepted: true });

    const failure = adapter.client.request("feature.fail", undefined);
    expect(JSON.parse(socket.send.mock.calls[1]?.[0] ?? "")).not.toHaveProperty(
      "payload",
    );
    adapter.messageHandler(
      {
        type: "error",
        id: "request-2",
        code: "handler_error",
        message: "Rejected",
        isTerminal: true,
      },
      socket as unknown as WebSocket,
    );
    await expect(failure).rejects.toEqual(
      expect.objectContaining<Partial<WebSocketRequestError>>({
        code: "handler_error",
        message: "Rejected",
      }),
    );
  });

  it("delivers canonical events and ignores nonterminal protocol errors", async () => {
    vi.stubGlobal("WebSocket", FakeWebSocket);
    const socket = new FakeWebSocket();
    const adapter = createWorkspaceWebSocketAdapter(
      socket as unknown as WebSocket,
      "reference",
      (url) => url,
    );
    const handler = vi.fn();
    const unsubscribe = adapter.client.subscribe("feature.changed", handler);
    const request = adapter.client.request("feature.wait", {});

    adapter.messageHandler(
      {
        type: "error",
        id: "request-1",
        code: "correlation_in_use",
        message: "Duplicate request",
        isTerminal: false,
      },
      socket as unknown as WebSocket,
    );
    adapter.messageHandler(
      {
        type: "event",
        id: "event-1",
        channel: "feature.changed",
        payload: { revision: 2 },
      },
      socket as unknown as WebSocket,
    );
    expect(handler).toHaveBeenCalledWith({ revision: 2 });

    adapter.messageHandler(
      { type: "response", id: "request-1" },
      socket as unknown as WebSocket,
    );
    await expect(request).resolves.toBeUndefined();
    unsubscribe();
    adapter.messageHandler(
      {
        type: "event",
        id: "event-2",
        channel: "feature.changed",
        payload: { revision: 3 },
      },
      socket as unknown as WebSocket,
    );
    expect(handler).toHaveBeenCalledOnce();
  });

  it("rejects pending requests locally on disconnect without resending", async () => {
    vi.stubGlobal("WebSocket", FakeWebSocket);
    const socket = new FakeWebSocket();
    const adapter = createWorkspaceWebSocketAdapter(
      socket as unknown as WebSocket,
      "reference",
      (url) => url,
    );
    const pendingRequest = adapter.client.request("feature.wait", {});

    adapter.disconnectHandler(socket as unknown as WebSocket, "Network lost");
    await expect(pendingRequest).rejects.toEqual(
      expect.objectContaining({
        code: "connection_closed",
        message: "Network lost",
      }),
    );
    expect(socket.send).toHaveBeenCalledOnce();
    await expect(
      adapter.client.request("feature.wait", {}),
    ).rejects.toMatchObject({
      code: "connection_closed",
    });
    expect(socket.send).toHaveBeenCalledOnce();
  });

  it("replaces the socket without replaying requests and publishes a connection version", async () => {
    vi.stubGlobal("WebSocket", FakeWebSocket);
    const first = new FakeWebSocket();
    const adapter = createWorkspaceWebSocketAdapter(
      first as unknown as WebSocket,
      "reference",
      (url) => url,
    );
    const versionChanged = vi.fn();
    const unsubscribeVersion =
      adapter.client.connectionVersion?.subscribe(versionChanged);
    const eventHandler = vi.fn();
    adapter.client.subscribe("feature.changed", eventHandler);
    const abandoned = adapter.client.request("feature.mutate", {
      value: 1,
    });

    adapter.disconnectHandler(first as unknown as WebSocket, "Network lost");
    await expect(abandoned).rejects.toMatchObject({
      code: "connection_closed",
    });

    const second = new FakeWebSocket();
    adapter.setSocket(second as unknown as WebSocket);
    expect(adapter.client.connectionVersion?.getSnapshot()).toBe(2);
    expect(versionChanged).toHaveBeenCalledOnce();
    expect(second.send).not.toHaveBeenCalled();

    adapter.messageHandler(
      {
        type: "event",
        id: "stale-event",
        channel: "feature.changed",
        payload: { stale: true },
      },
      first as unknown as WebSocket,
    );
    expect(eventHandler).not.toHaveBeenCalled();

    const recovered = adapter.client.request("feature.snapshot", undefined);
    expect(JSON.parse(second.send.mock.calls[0]?.[0] ?? "")).toEqual({
      type: "request",
      id: "request-2",
      channel: "feature.snapshot",
    });
    adapter.messageHandler(
      { type: "response", id: "request-2", value: { revision: 2 } },
      second as unknown as WebSocket,
    );
    await expect(recovered).resolves.toEqual({ revision: 2 });
    unsubscribeVersion?.();
  });
});
