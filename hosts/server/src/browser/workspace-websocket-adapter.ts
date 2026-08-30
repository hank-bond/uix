// Adapts one accepted browser WebSocket to the host-neutral workspace client.

import type { WorkspaceClient } from "@uix/api/workspace";

import type { WebSocketServerFrame } from "../websocket-frames";

interface PendingRequest {
  readonly resolve: (value: unknown) => void;
  readonly reject: (error: Error) => void;
}

export interface WorkspaceWebSocketAdapter extends Disposable {
  readonly client: WorkspaceClient;
  readonly frameHandler: (frame: WebSocketServerFrame) => void;
  readonly closeHandler: (message?: string) => void;
}

export class WebSocketRequestError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "WebSocketRequestError";
    this.code = code;
  }
}

/** Create the client-side request correlation and event subscription state. */
export function createWorkspaceWebSocketAdapter(
  socket: WebSocket,
  workspaceId: string,
  resolveResourceUrl: (logicalUrl: string) => string,
): WorkspaceWebSocketAdapter {
  let nextRequestId = 1;
  let isDisposed = false;
  const pendingRequests = new Map<string, PendingRequest>();
  const handlersByChannel = new Map<string, Set<(payload: unknown) => void>>();

  const client: WorkspaceClient = {
    workspaceId,
    resolveResourceUrl,
    request(channel, payload) {
      if (isDisposed || socket.readyState !== WebSocket.OPEN) {
        return Promise.reject(
          new WebSocketRequestError(
            "connection_closed",
            "WebSocket connection is closed",
          ),
        );
      }
      const requestId = `request-${String(nextRequestId)}`;
      nextRequestId += 1;
      let encodedFrame: string;
      try {
        encodedFrame = JSON.stringify({
          type: "request",
          id: requestId,
          channel,
          ...(payload === undefined ? {} : { payload }),
        });
      } catch (error) {
        return Promise.reject(
          error instanceof Error ? error : new Error(String(error)),
        );
      }
      return new Promise<unknown>((resolve, reject) => {
        pendingRequests.set(requestId, { resolve, reject });
        try {
          socket.send(encodedFrame);
        } catch (error) {
          pendingRequests.delete(requestId);
          reject(error instanceof Error ? error : new Error(String(error)));
        }
      });
    },
    subscribe(channel, handler) {
      let handlers = handlersByChannel.get(channel);
      if (!handlers) {
        handlers = new Set();
        handlersByChannel.set(channel, handlers);
      }
      handlers.add(handler);
      let isUnsubscribed = false;
      return () => {
        if (isUnsubscribed) return;
        isUnsubscribed = true;
        handlers.delete(handler);
        if (handlers.size === 0) handlersByChannel.delete(channel);
      };
    },
  };

  const closeHandler = (message = "WebSocket connection closed"): void => {
    if (isDisposed) return;
    isDisposed = true;
    const error = new WebSocketRequestError("connection_closed", message);
    for (const request of pendingRequests.values()) request.reject(error);
    pendingRequests.clear();
    handlersByChannel.clear();
  };

  return {
    client,
    frameHandler(frame): void {
      if (isDisposed) return;
      switch (frame.type) {
        case "ready":
          throw new Error("Received a second WebSocket ready frame");
        case "response": {
          const request = pendingRequests.get(frame.id);
          if (!request) return;
          pendingRequests.delete(frame.id);
          request.resolve(frame.value);
          return;
        }
        case "error": {
          if (!frame.isTerminal || !frame.id) return;
          const request = pendingRequests.get(frame.id);
          if (!request) return;
          pendingRequests.delete(frame.id);
          request.reject(new WebSocketRequestError(frame.code, frame.message));
          return;
        }
        case "event":
          for (const handler of handlersByChannel.get(frame.channel) ?? []) {
            handler(frame.payload);
          }
          return;
      }
    },
    closeHandler,
    [Symbol.dispose]: closeHandler,
  };
}
