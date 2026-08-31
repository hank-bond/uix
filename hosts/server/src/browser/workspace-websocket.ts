// Owns one reconnecting workspace connection, shutdown notices, and its stable client.

import type { WorkspaceClient } from "@uix/api/workspace";
import type { SessionLocationAdapter } from "@uix/client/workspace";

import {
  createWorkspaceWebSocketAdapter,
  type WorkspaceWebSocketAdapter,
} from "./workspace-websocket-adapter";
import { resolveServerResourceUrl } from "../resource-urls";
import { parseWebSocketServerMessage } from "../websocket-messages";

interface WorkspaceWebSocketReady {
  readonly client: WorkspaceClient;
  readonly sessionId: string;
  readonly sessionLocationAdapter: SessionLocationAdapter;
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
  let historyNavigationTarget: string | undefined;
  let historyNavigation: Promise<void> | undefined;
  let sessionNavigationHandler:
    | ((sessionId: string) => Promise<void>)
    | undefined;

  const getConnectionPath = (): string =>
    acceptedSessionId
      ? toWorkspaceSessionPath(workspaceId, acceptedSessionId)
      : initialPath;

  const resolveWebSocketLocation = (): URL => {
    const location = new URL(getConnectionPath(), window.location.origin);
    location.protocol = location.protocol === "https:" ? "wss:" : "ws:";
    return location;
  };

  const failLocationSynchronization = (): void => {
    hasFatalFailure = true;
    status.hidden = false;
    status.textContent = "Unable to synchronize session location";
    activeSocket?.close(1011, "Unable to synchronize session location");
  };

  const restoreAcceptedLocation = (sessionId: string): void => {
    try {
      window.history.replaceState(
        null,
        "",
        toWorkspaceSessionPath(workspaceId, sessionId),
      );
    } catch {
      failLocationSynchronization();
    }
  };

  const reconcileHistoryLocation = (): void => {
    const previousSessionId = acceptedSessionId;
    if (
      isDisposed ||
      hasFatalFailure ||
      !previousSessionId ||
      historyNavigation
    ) {
      return;
    }

    let requestedSessionId: string;
    try {
      const requested = parseWorkspaceSessionPath(window.location.pathname);
      if (requested.workspaceId !== workspaceId) {
        throw new Error("History location changed the workspace target");
      }
      requestedSessionId = requested.sessionId;
    } catch {
      restoreAcceptedLocation(previousSessionId);
      return;
    }
    if (requestedSessionId === previousSessionId) return;

    const navigate = sessionNavigationHandler;
    if (!navigate) {
      restoreAcceptedLocation(previousSessionId);
      return;
    }

    historyNavigationTarget = requestedSessionId;
    const navigation = navigate(requestedSessionId)
      .then(() => {
        if (acceptedSessionId !== requestedSessionId) {
          throw new Error("Session navigation did not synchronize location");
        }
      })
      .catch(() => {
        acceptedSessionId = previousSessionId;
        restoreAcceptedLocation(previousSessionId);
      })
      .finally(() => {
        if (historyNavigation !== navigation) return;
        historyNavigation = undefined;
        historyNavigationTarget = undefined;
        // A second traversal may have changed the URL while this retarget was
        // pending. Reconcile that location after the accepted result settles.
        reconcileHistoryLocation();
      });
    historyNavigation = navigation;
  };

  const sessionLocationAdapter: SessionLocationAdapter = {
    synchronize(sessionId): void {
      if (sessionId === acceptedSessionId) return;
      acceptedSessionId = sessionId;
      if (sessionId === historyNavigationTarget) return;
      try {
        window.history.pushState(
          null,
          "",
          toWorkspaceSessionPath(workspaceId, sessionId),
        );
      } catch (error) {
        failLocationSynchronization();
        throw error;
      }
    },
    subscribe(navigate): () => void {
      if (sessionNavigationHandler) {
        throw new Error("Session location adapter already has a subscriber");
      }
      sessionNavigationHandler = navigate;
      return () => {
        if (sessionNavigationHandler === navigate) {
          sessionNavigationHandler = undefined;
        }
      };
    },
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
            throw new Error("WebSocket messages must be text");
          }
          const decodedMessage = JSON.parse(event.data) as unknown;
          const serverMessage = parseWebSocketServerMessage(decodedMessage);
          if (serverMessage.type === "shutdown") {
            status.hidden = false;
            status.textContent = serverMessage.message;
            return;
          }
          if (serverMessage.type === "ready") {
            if (isAccepted) {
              throw new Error("Received a second WebSocket ready message");
            }
            const readyMessage = serverMessage;
            const canonicalLocation = parseCanonicalSessionLocation(
              readyMessage.canonicalPath,
              workspaceId,
              readyMessage.sessionId,
            );
            if (
              acceptedSessionId &&
              readyMessage.sessionId !== acceptedSessionId
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

            acceptedSessionId = readyMessage.sessionId;
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
                sessionId: readyMessage.sessionId,
                sessionLocationAdapter,
              });
            } else {
              webSocketAdapter.setSocket(socket);
            }
            status.textContent = "Connected";
            if (clientMount) status.hidden = true;
            return;
          }
          if (!isAccepted) {
            throw new Error("First WebSocket message did not accept a session");
          }
          webSocketAdapter?.messageHandler(serverMessage, socket);
        } catch {
          hasFatalFailure = true;
          status.hidden = false;
          status.textContent = "Unable to open workspace";
          socket.close(
            1002,
            isAccepted
              ? "Invalid WebSocket message"
              : "Invalid WebSocket ready message",
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
  window.addEventListener("popstate", reconcileHistoryLocation);
  document.addEventListener("visibilitychange", visibilityHandler);
  openSocket();

  return {
    [Symbol.dispose](): void {
      if (isDisposed) return;
      isDisposed = true;
      clearReconnectTimer();
      window.removeEventListener("online", onlineHandler);
      window.removeEventListener("popstate", reconcileHistoryLocation);
      document.removeEventListener("visibilitychange", visibilityHandler);
      sessionNavigationHandler = undefined;
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
      "Canonical workspace target does not match the ready message",
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
