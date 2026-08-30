// Binds workspace page routes and WebSockets to supervised workspace attachments.

import { type WebSocket } from "@fastify/websocket";
import type { FastifyInstance, FastifyReply } from "fastify";

import type { WorkspaceSupervisor } from "@uix/host";
import type { Attachment } from "@uix/runtime";
import { toSessionId } from "@uix/runtime";
import { createLogger } from "@uix/runtime/log";

import { setMutableResponseHeaders } from "./mutable-response";
import type { RegisteredWorkspace, WorkspaceRegistry } from "./registry";
import {
  toWorkspaceSessionPath,
  WorkspacePageRoute,
  WorkspaceSessionPageRoute,
} from "./routes";
import { bindWorkspaceWebSocket } from "./workspace-websocket";
import { toWebSocketReadyFrame } from "../websocket-frames";

const log = createLogger("server-websocket");

interface WorkspaceRouteParams {
  readonly workspaceId: string;
  readonly sessionId?: string;
}

export function registerWorkspaceRoutes(
  app: FastifyInstance,
  registry: WorkspaceRegistry,
  supervisor: WorkspaceSupervisor,
  workspaceHtml: string,
  workspaceScript: string,
  workspaceStyles: string,
  publicOrigin: string,
): void {
  const contentSecurityPolicy =
    deriveWorkspaceContentSecurityPolicy(publicOrigin);
  const serveWorkspace = (
    workspaceId: string,
    reply: FastifyReply,
  ): FastifyReply => {
    try {
      registry.require(workspaceId);
    } catch {
      setMutableResponseHeaders(reply);
      return reply.code(404).send({
        code: "workspace_not_found",
        message: "Workspace not found",
      });
    }
    setMutableResponseHeaders(reply);
    return reply
      .header("Content-Security-Policy", contentSecurityPolicy)
      .type("text/html; charset=utf-8")
      .send(workspaceHtml);
  };

  app.route<{ Params: WorkspaceRouteParams }>({
    method: "GET",
    url: WorkspacePageRoute,
    handler: (request, reply) =>
      serveWorkspace(request.params.workspaceId, reply),
    wsHandler: (socket, request) => {
      workspaceWebSocketHandler(socket, request.params, registry, supervisor);
    },
  });
  app.route<{ Params: WorkspaceRouteParams }>({
    method: "GET",
    url: WorkspaceSessionPageRoute,
    handler: (request, reply) =>
      serveWorkspace(request.params.workspaceId, reply),
    wsHandler: (socket, request) => {
      workspaceWebSocketHandler(socket, request.params, registry, supervisor);
    },
  });

  app.get("/assets/workspace.js", (_request, reply) => {
    setMutableResponseHeaders(reply);
    return reply.type("text/javascript; charset=utf-8").send(workspaceScript);
  });
  app.get("/assets/workspace.css", (_request, reply) => {
    setMutableResponseHeaders(reply);
    return reply.type("text/css; charset=utf-8").send(workspaceStyles);
  });
}

function workspaceWebSocketHandler(
  socket: WebSocket,
  params: WorkspaceRouteParams,
  registry: WorkspaceRegistry,
  supervisor: WorkspaceSupervisor,
): void {
  let registered: RegisteredWorkspace;
  try {
    registered = registry.require(params.workspaceId);
  } catch {
    socket.close(1008, "Workspace not found");
    return;
  }

  let connectionGuard:
    | Awaited<ReturnType<WorkspaceSupervisor["acquire"]>>
    | undefined;
  let connectionAttachment: Attachment | undefined;
  let webSocketBinding: Disposable | undefined;
  let isClosed = false;
  const isConnectionClosed = (): boolean => isClosed;
  const prematureMessageHandler = (): void => {
    socket.close(1002, "WebSocket connection is not ready");
  };

  const disposeConnectionOwnership = (): void => {
    webSocketBinding?.[Symbol.dispose]();
    webSocketBinding = undefined;
    connectionAttachment?.[Symbol.dispose]();
    connectionAttachment = undefined;
    connectionGuard?.[Symbol.dispose]();
    connectionGuard = undefined;
  };
  socket.on("message", prematureMessageHandler);
  socket.once("close", () => {
    isClosed = true;
    socket.off("message", prematureMessageHandler);
    disposeConnectionOwnership();
  });

  void (async () => {
    let workspaceGuard:
      | Awaited<ReturnType<WorkspaceSupervisor["acquire"]>>
      | undefined;
    let acceptedAttachment: Attachment | undefined;
    try {
      workspaceGuard = await supervisor.acquire(
        registered.id,
        `server-websocket:${registered.id}`,
      );
      if (isConnectionClosed()) return;

      acceptedAttachment = await workspaceGuard.value.createAttachment(
        params.sessionId
          ? {
              kind: "session",
              target: { sessionId: toSessionId(params.sessionId) },
            }
          : { kind: "new-session" },
      );
      if (isConnectionClosed() || socket.readyState !== socket.OPEN) {
        return;
      }

      connectionGuard = workspaceGuard;
      workspaceGuard = undefined;
      connectionAttachment = acceptedAttachment;
      acceptedAttachment = undefined;
      const readyFrame = toWebSocketReadyFrame(
        connectionAttachment.target.sessionId,
        toWorkspaceSessionPath(
          registered.id,
          connectionAttachment.target.sessionId,
        ),
      );
      socket.off("message", prematureMessageHandler);
      webSocketBinding = bindWorkspaceWebSocket(
        socket,
        connectionAttachment,
        readyFrame,
      );
    } catch (error) {
      disposeConnectionOwnership();
      log.error(
        {
          err: error,
          workspaceId: registered.id,
          sessionId: params.sessionId,
        },
        "workspace_websocket_open_failed",
      );
      if (!isConnectionClosed()) {
        socket.close(1011, "Unable to open workspace");
      }
    } finally {
      acceptedAttachment?.[Symbol.dispose]();
      workspaceGuard?.[Symbol.dispose]();
    }
  })();
}

function deriveWorkspaceContentSecurityPolicy(publicOrigin: string): string {
  const liveOrigin = new URL(publicOrigin);
  liveOrigin.protocol = liveOrigin.protocol === "https:" ? "wss:" : "ws:";
  return [
    "default-src 'none'",
    "script-src 'self'",
    "style-src 'self'",
    "font-src 'self'",
    "img-src 'self' data:",
    "frame-src 'self'",
    `connect-src 'self' ${liveOrigin.origin}`,
    "base-uri 'none'",
    "form-action 'none'",
    "frame-ancestors 'none'",
  ].join("; ");
}
