// Opens one workspace page's WebSocket and adapts its accepted session to a workspace client.

import type { WorkspaceClient } from "@uix/api/workspace";

import {
  createWorkspaceWebSocketAdapter,
  type WorkspaceWebSocketAdapter,
} from "./workspace-websocket-adapter";
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

/** Own the concrete browser connection from shell load through accepted target. */
export function openWorkspaceWebSocket(
  options: OpenWorkspaceWebSocketOptions = {},
): Disposable {
  const status = document.getElementById("status");
  if (!status) throw new Error("#status not found");
  const workspaceId = parseWorkspaceIdFromPath(window.location.pathname);

  const webSocketLocation = new URL(window.location.href);
  webSocketLocation.protocol =
    webSocketLocation.protocol === "https:" ? "wss:" : "ws:";
  webSocketLocation.search = "";
  webSocketLocation.hash = "";

  const socket = new WebSocket(webSocketLocation);
  let webSocketAdapter: WorkspaceWebSocketAdapter | undefined;
  let clientMount: Disposable | undefined;
  let isDisposed = false;
  let hasFailed = false;

  socket.addEventListener("open", () => {
    if (!isDisposed) status.textContent = "Opening workspace…";
  });
  socket.addEventListener("message", (event) => {
    if (isDisposed) return;
    try {
      if (typeof event.data !== "string") {
        throw new Error("WebSocket frames must be text");
      }
      const decodedFrame = JSON.parse(event.data) as unknown;
      if (!webSocketAdapter) {
        const readyFrame = parseWebSocketReadyFrame(decodedFrame);
        const canonicalLocation = parseCanonicalSessionLocation(
          readyFrame.canonicalPath,
          workspaceId,
          readyFrame.sessionId,
        );
        try {
          window.history.replaceState(null, "", canonicalLocation);
        } catch {
          hasFailed = true;
          status.textContent = "Unable to open workspace";
          socket.close(1011, "Unable to canonicalize workspace");
          return;
        }
        webSocketAdapter = createWorkspaceWebSocketAdapter(socket, workspaceId);
        clientMount = options.readyHandler?.({
          client: webSocketAdapter.client,
          sessionId: readyFrame.sessionId,
          synchronizeSessionLocation: (sessionId) => {
            window.history.replaceState(
              null,
              "",
              toWorkspaceSessionPath(workspaceId, sessionId),
            );
          },
        });
        status.textContent = "Connected";
        return;
      }
      webSocketAdapter.frameHandler(parseWebSocketServerFrame(decodedFrame));
    } catch {
      status.textContent = "Unable to open workspace";
      socket.close(
        1002,
        webSocketAdapter
          ? "Invalid WebSocket frame"
          : "Invalid WebSocket ready frame",
      );
      hasFailed = true;
    }
  });
  socket.addEventListener("error", () => {
    if (!isDisposed && !webSocketAdapter) {
      hasFailed = true;
      status.textContent = "Unable to open workspace";
    }
  });
  socket.addEventListener("close", () => {
    webSocketAdapter?.closeHandler();
    if (!isDisposed && !hasFailed) status.textContent = "Disconnected";
  });

  return {
    [Symbol.dispose](): void {
      if (isDisposed) return;
      isDisposed = true;
      clientMount?.[Symbol.dispose]();
      clientMount = undefined;
      webSocketAdapter?.[Symbol.dispose]();
      webSocketAdapter = undefined;
      socket.close(1000, "Page closed");
    },
  };
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
