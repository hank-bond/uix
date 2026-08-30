// Adapts replaceable accepted browser WebSockets to one host-neutral workspace client.

import type {
  WorkspaceClient,
  WorkspaceConnectionVersion,
} from "@uix/api/workspace";

import type { WebSocketServerFrame } from "../websocket-frames";

interface PendingRequest {
  readonly socket: WebSocket;
  readonly resolve: (value: unknown) => void;
  readonly reject: (error: Error) => void;
}

export interface WorkspaceWebSocketAdapter extends Disposable {
  readonly client: WorkspaceClient;
  readonly setSocket: (socket: WebSocket) => void;
  readonly frameHandler: (
    frame: WebSocketServerFrame,
    socket: WebSocket,
  ) => void;
  readonly disconnectHandler: (socket: WebSocket, message?: string) => void;
}

export class WebSocketRequestError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "WebSocketRequestError";
    this.code = code;
  }
}

/** Create persistent correlation and subscription state over replaceable sockets. */
export function createWorkspaceWebSocketAdapter(
  socket: WebSocket,
  workspaceId: string,
  resolveResourceUrl: (logicalUrl: string) => string,
): WorkspaceWebSocketAdapter {
  let nextRequestId = 1;
  let isDisposed = false;
  let activeSocket: WebSocket | undefined;
  let connectionVersionValue = 0;
  const connectionVersionListeners = new Set<() => void>();
  const pendingRequests = new Map<string, PendingRequest>();
  const handlersByChannel = new Map<string, Set<(payload: unknown) => void>>();

  const connectionVersion: WorkspaceConnectionVersion = {
    getSnapshot: () => connectionVersionValue,
    subscribe(listener) {
      connectionVersionListeners.add(listener);
      return () => {
        connectionVersionListeners.delete(listener);
      };
    },
  };

  const client: WorkspaceClient = {
    workspaceId,
    resolveResourceUrl,
    connectionVersion,
    request(channel, payload) {
      const acceptedSocket = activeSocket;
      if (
        isDisposed ||
        !acceptedSocket ||
        acceptedSocket.readyState !== WebSocket.OPEN
      ) {
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
        pendingRequests.set(requestId, {
          socket: acceptedSocket,
          resolve,
          reject,
        });
        try {
          acceptedSocket.send(encodedFrame);
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

  const rejectSocketRequests = (
    closedSocket: WebSocket,
    message: string,
  ): void => {
    const error = new WebSocketRequestError("connection_closed", message);
    for (const [requestId, request] of pendingRequests) {
      if (request.socket !== closedSocket) continue;
      pendingRequests.delete(requestId);
      request.reject(error);
    }
  };

  const disconnectHandler = (
    closedSocket: WebSocket,
    message = "WebSocket connection closed",
  ): void => {
    if (isDisposed) return;
    if (activeSocket === closedSocket) activeSocket = undefined;
    rejectSocketRequests(closedSocket, message);
  };

  const setSocket = (nextSocket: WebSocket): void => {
    if (isDisposed) throw new Error("Workspace WebSocket adapter is disposed");
    if (activeSocket && activeSocket !== nextSocket) {
      throw new Error("Workspace WebSocket adapter already has a connection");
    }
    if (activeSocket === nextSocket) return;
    activeSocket = nextSocket;
    connectionVersionValue += 1;
    for (const listener of connectionVersionListeners) listener();
  };

  setSocket(socket);

  return {
    client,
    setSocket,
    frameHandler(frame, sourceSocket): void {
      if (isDisposed || sourceSocket !== activeSocket) return;
      switch (frame.type) {
        case "ready":
          throw new Error("Received a second WebSocket ready frame");
        case "response": {
          const request = pendingRequests.get(frame.id);
          if (!request || request.socket !== sourceSocket) return;
          pendingRequests.delete(frame.id);
          request.resolve(frame.value);
          return;
        }
        case "error": {
          if (!frame.isTerminal || !frame.id) return;
          const request = pendingRequests.get(frame.id);
          if (!request || request.socket !== sourceSocket) return;
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
    disconnectHandler,
    [Symbol.dispose](): void {
      if (isDisposed) return;
      const socketAtDisposal = activeSocket;
      if (socketAtDisposal) {
        disconnectHandler(socketAtDisposal, "Workspace client disposed");
      }
      isDisposed = true;
      const error = new WebSocketRequestError(
        "connection_closed",
        "Workspace client disposed",
      );
      for (const request of pendingRequests.values()) request.reject(error);
      pendingRequests.clear();
      handlersByChannel.clear();
      connectionVersionListeners.clear();
    },
  };
}
