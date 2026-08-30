// Owns one reconnecting workspace connection and adapts accepted sockets to a stable client.

import type { WorkspaceClient } from "@uix/api/workspace";

import {
  createWorkspaceWebSocketAdapter,
  type WorkspaceWebSocketAdapter,
} from "./workspace-websocket-adapter";
import { resolveServerResourceUrl } from "../resource-urls";
import {
  parseWebSocketReadyFrame,
  parseWebSocketServerFrame,
} from "../websocket-frames";

interface WorkspaceWebSocketReady {
  readonly client: WorkspaceClient;
  readonly sessionId: string;
  readonly synchronizeSessionLocation: (sessionId: string) => void;
}

interface OpenWorkspaceWebSocketOptions {
  readonly readyHandler?: (
    ready: WorkspaceWebSocketReady,
  ) => Disposable | undefined;
}

/** Own the concrete browser connection, recovery, and accepted session target. */
export function openWorkspaceWebSocket(
  options: OpenWorkspaceWebSocketOptions = {},
): Disposable {
  const status = document.getElementById("status");
  if (!status) throw new Error("#status not found");
  const initialPath = window.location.pathname;
  const workspaceId = parseWorkspaceIdFromPath(initialPath);

  let activeSocket: WebSocket | undefined;
  let activeSocketListeners: AbortController | undefined;
  let webSocketAdapter: WorkspaceWebSocketAdapter | undefined;
  let clientMount: Disposable | undefined;
  let acceptedSessionId: string | undefined;
  let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
  let reconnectAttempt = 0;
  let isDisposed = false;
  let hasFatalFailure = false;

  const getConnectionPath = (): string =>
    acceptedSessionId
      ? toWorkspaceSessionPath(workspaceId, acceptedSessionId)
      : initialPath;

  const resolveWebSocketLocation = (): URL => {
    const location = new URL(getConnectionPath(), window.location.origin);
    location.protocol = location.protocol === "https:" ? "wss:" : "ws:";
    return location;
  };

  const clearReconnectTimer = (): void => {
    if (reconnectTimer === undefined) return;
    clearTimeout(reconnectTimer);
    reconnectTimer = undefined;
  };

  const scheduleReconnect = (): void => {
    if (
      isDisposed ||
      hasFatalFailure ||
      activeSocket ||
      reconnectTimer !== undefined
    ) {
      return;
    }
    const delay = deriveReconnectDelayMs(reconnectAttempt);
    reconnectAttempt += 1;
    status.hidden = false;
    status.textContent = "Disconnected; reconnecting…";
    reconnectTimer = setTimeout(() => {
      reconnectTimer = undefined;
      openSocket();
    }, delay);
  };

  const openSocketNow = (): void => {
    if (isDisposed || hasFatalFailure || activeSocket) return;
    clearReconnectTimer();
    openSocket();
  };

  const openSocket = (): void => {
    if (isDisposed || hasFatalFailure || activeSocket) return;
    const socket = new WebSocket(resolveWebSocketLocation());
    const socketListeners = new AbortController();
    activeSocket = socket;
    activeSocketListeners = socketListeners;
    let isAccepted = false;

    socket.addEventListener(
      "open",
      () => {
        if (isDisposed || socket !== activeSocket) return;
        status.hidden = false;
        status.textContent = webSocketAdapter
          ? "Reopening workspace…"
          : "Opening workspace…";
      },
      { signal: socketListeners.signal },
    );
    socket.addEventListener(
      "message",
      (event) => {
        if (isDisposed || socket !== activeSocket) return;
        try {
          if (typeof event.data !== "string") {
            throw new Error("WebSocket frames must be text");
          }
          const decodedFrame = JSON.parse(event.data) as unknown;
          if (!isAccepted) {
            const readyFrame = parseWebSocketReadyFrame(decodedFrame);
            const canonicalLocation = parseCanonicalSessionLocation(
              readyFrame.canonicalPath,
              workspaceId,
              readyFrame.sessionId,
            );
            if (
              acceptedSessionId &&
              readyFrame.sessionId !== acceptedSessionId
            ) {
              throw new Error(
                "Replacement connection changed the session target",
              );
            }
            try {
              if (!acceptedSessionId) {
                window.history.replaceState(null, "", canonicalLocation);
              }
            } catch {
              hasFatalFailure = true;
              status.hidden = false;
              status.textContent = "Unable to open workspace";
              socket.close(1011, "Unable to canonicalize workspace");
              return;
            }

            acceptedSessionId = readyFrame.sessionId;
            isAccepted = true;
            reconnectAttempt = 0;
            if (!webSocketAdapter) {
              webSocketAdapter = createWorkspaceWebSocketAdapter(
                socket,
                workspaceId,
                (logicalUrl) =>
                  resolveServerResourceUrl(
                    window.location.origin,
                    workspaceId,
                    logicalUrl,
                  ),
              );
              clientMount = options.readyHandler?.({
                client: webSocketAdapter.client,
                sessionId: readyFrame.sessionId,
                synchronizeSessionLocation: (sessionId) => {
                  if (sessionId === acceptedSessionId) return;
                  acceptedSessionId = sessionId;
                  window.history.pushState(
                    null,
                    "",
                    toWorkspaceSessionPath(workspaceId, sessionId),
                  );
                },
              });
            } else {
              webSocketAdapter.setSocket(socket);
            }
            status.textContent = "Connected";
            if (clientMount) status.hidden = true;
            return;
          }
          webSocketAdapter?.frameHandler(
            parseWebSocketServerFrame(decodedFrame),
            socket,
          );
        } catch {
          hasFatalFailure = true;
          status.hidden = false;
          status.textContent = "Unable to open workspace";
          socket.close(
            1002,
            isAccepted
              ? "Invalid WebSocket frame"
              : "Invalid WebSocket ready frame",
          );
        }
      },
      { signal: socketListeners.signal },
    );
    socket.addEventListener(
      "error",
      () => {
        if (isDisposed || socket !== activeSocket || hasFatalFailure) return;
        status.hidden = false;
        status.textContent = webSocketAdapter
          ? "Connection interrupted…"
          : "Unable to connect; retrying…";
      },
      { signal: socketListeners.signal },
    );
    socket.addEventListener(
      "close",
      () => {
        socketListeners.abort();
        webSocketAdapter?.disconnectHandler(socket);
        if (socket === activeSocket) {
          activeSocket = undefined;
          activeSocketListeners = undefined;
        }
        if (!isDisposed && !hasFatalFailure) scheduleReconnect();
      },
      { signal: socketListeners.signal },
    );
  };

  const onlineHandler = (): void => {
    openSocketNow();
  };
  const visibilityHandler = (): void => {
    if (document.visibilityState === "visible") openSocketNow();
  };
  window.addEventListener("online", onlineHandler);
  document.addEventListener("visibilitychange", visibilityHandler);
  openSocket();

  return {
    [Symbol.dispose](): void {
      if (isDisposed) return;
      isDisposed = true;
      clearReconnectTimer();
      window.removeEventListener("online", onlineHandler);
      document.removeEventListener("visibilitychange", visibilityHandler);
      activeSocketListeners?.abort();
      activeSocketListeners = undefined;
      clientMount?.[Symbol.dispose]();
      clientMount = undefined;
      webSocketAdapter?.[Symbol.dispose]();
      webSocketAdapter = undefined;
      activeSocket?.close(1000, "Page closed");
      activeSocket = undefined;
    },
  };
}

function deriveReconnectDelayMs(attempt: number): number {
  return Math.min(250 * 2 ** attempt, 10_000);
}

function parseCanonicalSessionLocation(
  path: string,
  expectedWorkspaceId: string,
  expectedSessionId: string,
): URL {
  const canonical = new URL(path, window.location.origin);
  if (
    canonical.origin !== window.location.origin ||
    `${canonical.pathname}${canonical.search}${canonical.hash}` !== path
  ) {
    throw new Error("Invalid canonical workspace path");
  }
  const target = parseWorkspaceSessionPath(canonical.pathname);
  if (
    target.workspaceId !== expectedWorkspaceId ||
    target.sessionId !== expectedSessionId
  ) {
    throw new Error(
      "Canonical workspace target does not match the ready frame",
    );
  }
  return canonical;
}

function parseWorkspaceIdFromPath(pathname: string): string {
  const match = /^\/workspaces\/([^/]+)(?:\/sessions\/[^/]+)?$/.exec(pathname);
  if (!match?.[1]) throw new Error("Invalid workspace page location");
  return decodeURIComponent(match[1]);
}

function parseWorkspaceSessionPath(pathname: string): {
  readonly workspaceId: string;
  readonly sessionId: string;
} {
  const match = /^\/workspaces\/([^/]+)\/sessions\/([^/]+)$/.exec(pathname);
  if (!match?.[1] || !match[2]) {
    throw new Error("Invalid canonical workspace-session path");
  }
  return {
    workspaceId: decodeURIComponent(match[1]),
    sessionId: decodeURIComponent(match[2]),
  };
}

function toWorkspaceSessionPath(
  workspaceId: string,
  sessionId: string,
): string {
  return `/workspaces/${encodeURIComponent(workspaceId)}/sessions/${encodeURIComponent(sessionId)}`;
}
