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

    adapter.frameHandler({
      type: "response",
      id: "request-1",
      value: { accepted: true },
    });
    await expect(success).resolves.toEqual({ accepted: true });

    const failure = adapter.client.request("feature.fail", undefined);
    expect(JSON.parse(socket.send.mock.calls[1]?.[0] ?? "")).not.toHaveProperty(
      "payload",
    );
    adapter.frameHandler({
      type: "error",
      id: "request-2",
      code: "handler_error",
      message: "Rejected",
      isTerminal: true,
    });
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

    adapter.frameHandler({
      type: "error",
      id: "request-1",
      code: "correlation_in_use",
      message: "Duplicate request",
      isTerminal: false,
    });
    adapter.frameHandler({
      type: "event",
      id: "event-1",
      channel: "feature.changed",
      payload: { revision: 2 },
    });
    expect(handler).toHaveBeenCalledWith({ revision: 2 });

    adapter.frameHandler({ type: "response", id: "request-1" });
    await expect(request).resolves.toBeUndefined();
    unsubscribe();
    adapter.frameHandler({
      type: "event",
      id: "event-2",
      channel: "feature.changed",
      payload: { revision: 3 },
    });
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

    adapter.closeHandler("Network lost");
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
});
