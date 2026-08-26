// Binds workspace page routes and live connections to supervised workspace attachments.

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
import { createLiveReadyFrame } from "../live";

const log = createLogger("server-live");

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
  publicOrigin: string,
): void {
  const contentSecurityPolicy =
    createWorkspaceContentSecurityPolicy(publicOrigin);
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
      acceptWorkspaceConnection(socket, request.params, registry, supervisor);
    },
  });
  app.route<{ Params: WorkspaceRouteParams }>({
    method: "GET",
    url: WorkspaceSessionPageRoute,
    handler: (request, reply) =>
      serveWorkspace(request.params.workspaceId, reply),
    wsHandler: (socket, request) => {
      acceptWorkspaceConnection(socket, request.params, registry, supervisor);
    },
  });

  app.get("/assets/workspace.js", (_request, reply) => {
    setMutableResponseHeaders(reply);
    return reply.type("text/javascript; charset=utf-8").send(workspaceScript);
  });
}

function acceptWorkspaceConnection(
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
  let isClosed = false;
  const isConnectionClosed = (): boolean => isClosed;

  const disposeConnectionOwnership = (): void => {
    connectionAttachment?.[Symbol.dispose]();
    connectionAttachment = undefined;
    connectionGuard?.[Symbol.dispose]();
    connectionGuard = undefined;
  };
  socket.once("close", () => {
    isClosed = true;
    disposeConnectionOwnership();
  });
  socket.on("message", () => {
    socket.close(1003, "Live requests are unavailable");
  });

  void (async () => {
    let workspaceGuard:
      | Awaited<ReturnType<WorkspaceSupervisor["acquire"]>>
      | undefined;
    let acceptedAttachment: Attachment | undefined;
    try {
      workspaceGuard = await supervisor.acquire(
        registered.id,
        `server-live:${registered.id}`,
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
      socket.send(
        JSON.stringify(
          createLiveReadyFrame(
            connectionAttachment.target.sessionId,
            toWorkspaceSessionPath(
              registered.id,
              connectionAttachment.target.sessionId,
            ),
          ),
        ),
      );
    } catch (error) {
      disposeConnectionOwnership();
      log.error(
        {
          err: error,
          workspaceId: registered.id,
          sessionId: params.sessionId,
        },
        "workspace_live_open_failed",
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

function createWorkspaceContentSecurityPolicy(publicOrigin: string): string {
  const liveOrigin = new URL(publicOrigin);
  liveOrigin.protocol = liveOrigin.protocol === "https:" ? "wss:" : "ws:";
  return [
    "default-src 'none'",
    "script-src 'self'",
    `connect-src 'self' ${liveOrigin.origin}`,
    "base-uri 'none'",
    "form-action 'none'",
    "frame-ancestors 'none'",
  ].join("; ");
}
