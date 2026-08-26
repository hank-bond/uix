// Composes the launcher, stateless workspace shell, and live attachment service.

import { readFile } from "node:fs/promises";
import { join } from "node:path";

import fastifyWebsocket, { type WebSocket } from "@fastify/websocket";
import Fastify, { type FastifyInstance, type FastifyReply } from "fastify";

import {
  type WorkspaceCatalog,
  WorkspaceCatalogVersion,
  WorkspaceSupervisor,
} from "@uix/host";
import type { Attachment, WorkspaceRuntime } from "@uix/runtime";
import { toSessionId } from "@uix/runtime";
import { createLogger } from "@uix/runtime/log";

import { normalizePublicOrigin, toWorkspaceLocation } from "./public-origin";
import {
  loadWorkspaceRegistry,
  type RegisteredWorkspace,
  type WorkspaceRegistry,
} from "./registry";
import {
  toWorkspaceSessionPath,
  WorkspacePageRoute,
  WorkspaceSessionPageRoute,
} from "./routes";
import { createLiveReadyFrame } from "../live";

const log = createLogger("server-live");

const LauncherContentSecurityPolicy = [
  "default-src 'none'",
  "script-src 'self'",
  "style-src 'self'",
  "connect-src 'self'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'",
].join("; ");

export interface CreateServerHostOptions {
  readonly registryPath: string;
  readonly publicOrigin: string | URL;
  readonly assetRoot: string;
  readonly bootWorkspace: (
    workspace: RegisteredWorkspace,
  ) => Promise<WorkspaceRuntime>;
}

interface ServerListenOptions {
  readonly host: string;
  readonly port: number;
}

export interface ServerHost extends AsyncDisposable {
  /** Boot-loaded private registry retained for later workspace operations. */
  readonly registry: WorkspaceRegistry;
  listen(options: ServerListenOptions): Promise<string>;
}

interface WorkspaceRouteParams {
  readonly workspaceId: string;
  readonly sessionId?: string;
}

/** Create the HTTP and live service without acquiring a workspace runtime. */
export async function createServerHost(
  options: CreateServerHostOptions,
): Promise<ServerHost> {
  const [
    registry,
    launcherHtml,
    launcherScript,
    launcherStyles,
    workspaceHtml,
    workspaceScript,
  ] = await Promise.all([
    loadWorkspaceRegistry(options.registryPath),
    readFile(join(options.assetRoot, "index.html"), "utf8"),
    readFile(join(options.assetRoot, "assets/launcher.js"), "utf8"),
    readFile(join(options.assetRoot, "assets/launcher.css"), "utf8"),
    readFile(join(options.assetRoot, "workspace.html"), "utf8"),
    readFile(join(options.assetRoot, "assets/workspace.js"), "utf8"),
  ]);
  const publicOrigin = normalizePublicOrigin(options.publicOrigin);
  const catalog: WorkspaceCatalog = Object.freeze({
    version: WorkspaceCatalogVersion,
    workspaces: Object.freeze(
      registry.list().map((entry) =>
        Object.freeze({
          id: entry.id,
          name: entry.name,
          location: toWorkspaceLocation(publicOrigin, entry.id),
        }),
      ),
    ),
  });
  const supervisor = new WorkspaceSupervisor({
    boot: (workspaceId) => options.bootWorkspace(registry.require(workspaceId)),
  });

  const app = Fastify({ logger: false });
  await app.register(fastifyWebsocket, {
    options: { maxPayload: 1024 * 1024 },
    errorHandler(error, socket) {
      log.error({ err: error }, "live_handler_failed");
      socket.close(1011, "Live connection failed");
    },
  });
  registerLauncherRoutes(
    app,
    catalog,
    launcherHtml,
    launcherScript,
    launcherStyles,
  );
  registerWorkspaceRoutes(
    app,
    registry,
    supervisor,
    workspaceHtml,
    workspaceScript,
    createWorkspaceContentSecurityPolicy(publicOrigin),
  );

  let disposal: Promise<void> | undefined;
  return {
    registry,
    listen: (listenOptions) => app.listen(listenOptions),
    [Symbol.asyncDispose](): Promise<void> {
      disposal ??= disposeServer(app, supervisor);
      return disposal;
    },
  };
}

function registerLauncherRoutes(
  app: FastifyInstance,
  catalog: WorkspaceCatalog,
  launcherHtml: string,
  launcherScript: string,
  launcherStyles: string,
): void {
  app.get("/", (_request, reply) => {
    setMutableHeaders(reply);
    return reply
      .header("Content-Security-Policy", LauncherContentSecurityPolicy)
      .type("text/html; charset=utf-8")
      .send(launcherHtml);
  });

  app.get("/api/catalog", (_request, reply) => {
    setMutableHeaders(reply);
    return reply.send(catalog);
  });

  app.get("/assets/launcher.js", (_request, reply) => {
    setMutableHeaders(reply);
    return reply.type("text/javascript; charset=utf-8").send(launcherScript);
  });

  app.get("/assets/launcher.css", (_request, reply) => {
    setMutableHeaders(reply);
    return reply.type("text/css; charset=utf-8").send(launcherStyles);
  });
}

function registerWorkspaceRoutes(
  app: FastifyInstance,
  registry: WorkspaceRegistry,
  supervisor: WorkspaceSupervisor,
  workspaceHtml: string,
  workspaceScript: string,
  contentSecurityPolicy: string,
): void {
  const serveWorkspace = (
    workspaceId: string,
    reply: FastifyReply,
  ): FastifyReply => {
    try {
      registry.require(workspaceId);
    } catch {
      setMutableHeaders(reply);
      return reply.code(404).send({
        code: "workspace_not_found",
        message: "Workspace not found",
      });
    }
    setMutableHeaders(reply);
    return reply
      .header("Content-Security-Policy", contentSecurityPolicy)
      .type("text/html; charset=utf-8")
      .send(workspaceHtml);
  };
  const openConnection = (
    socket: WebSocket,
    params: WorkspaceRouteParams,
  ): void => {
    let registered: RegisteredWorkspace;
    try {
      registered = registry.require(params.workspaceId);
    } catch {
      socket.close(1008, "Workspace not found");
      return;
    }
    ownLiveAttachment(socket, registered, params.sessionId, supervisor);
  };

  app.route<{ Params: WorkspaceRouteParams }>({
    method: "GET",
    url: WorkspacePageRoute,
    handler: (request, reply) =>
      serveWorkspace(request.params.workspaceId, reply),
    wsHandler: (socket, request) => {
      openConnection(socket, request.params);
    },
  });
  app.route<{ Params: WorkspaceRouteParams }>({
    method: "GET",
    url: WorkspaceSessionPageRoute,
    handler: (request, reply) =>
      serveWorkspace(request.params.workspaceId, reply),
    wsHandler: (socket, request) => {
      openConnection(socket, request.params);
    },
  });

  app.get("/assets/workspace.js", (_request, reply) => {
    setMutableHeaders(reply);
    return reply.type("text/javascript; charset=utf-8").send(workspaceScript);
  });
}

function ownLiveAttachment(
  socket: WebSocket,
  registered: RegisteredWorkspace,
  sessionId: string | undefined,
  supervisor: WorkspaceSupervisor,
): void {
  let guard: Awaited<ReturnType<WorkspaceSupervisor["acquire"]>> | undefined;
  let attachment: Attachment | undefined;
  const state = { closed: false };

  const release = (): void => {
    attachment?.[Symbol.dispose]();
    attachment = undefined;
    guard?.[Symbol.dispose]();
    guard = undefined;
  };
  socket.once("close", () => {
    state.closed = true;
    release();
  });
  socket.on("message", () => {
    socket.close(1003, "Live requests are not available yet");
  });

  void (async () => {
    try {
      guard = await supervisor.acquire(
        registered.id,
        `server-live:${registered.id}`,
      );
      if (state.closed) {
        release();
        return;
      }
      attachment = await guard.value.createAttachment(
        sessionId
          ? {
              kind: "session",
              target: { sessionId: toSessionId(sessionId) },
            }
          : { kind: "new-session" },
      );
      if (socket.readyState !== 1) {
        release();
        return;
      }
      socket.send(
        JSON.stringify(
          createLiveReadyFrame(
            attachment.target.sessionId,
            toWorkspaceSessionPath(registered.id, attachment.target.sessionId),
          ),
        ),
      );
    } catch (error) {
      release();
      log.error(
        { err: error, workspaceId: registered.id, sessionId },
        "workspace_live_open_failed",
      );
      if (!state.closed) socket.close(1011, "Unable to open workspace");
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

async function disposeServer(
  app: FastifyInstance,
  supervisor: WorkspaceSupervisor,
): Promise<void> {
  const failures: unknown[] = [];
  try {
    await app.close();
  } catch (error) {
    failures.push(error);
  }
  try {
    await supervisor[Symbol.asyncDispose]();
  } catch (error) {
    failures.push(error);
  }
  if (failures.length > 0) {
    throw new AggregateError(failures, "Server host disposal failed");
  }
}

function setMutableHeaders(reply: FastifyReply): void {
  reply
    .header("Cache-Control", "no-store")
    .header("Referrer-Policy", "no-referrer")
    .header("X-Content-Type-Options", "nosniff");
}
