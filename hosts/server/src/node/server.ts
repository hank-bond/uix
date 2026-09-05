// Composes one public-origin-gated server with graceful live-connection and workspace teardown.

import { readFile } from "node:fs/promises";
import { join } from "node:path";

import fastifyWebsocket from "@fastify/websocket";
import Fastify, { type FastifyInstance } from "fastify";

import {
  type WorkspaceCatalog,
  WorkspaceCatalogVersion,
  WorkspaceSupervisor,
} from "@uix/host";
import type { WorkspaceRuntime } from "@uix/runtime";
import type { ContentTransportRegistrar } from "@uix/runtime/content-transport";
import { createLogger } from "@uix/runtime/log";

import { registerLauncherRoutes } from "./launcher-routes";
import { setMutableResponseHeaders } from "./mutable-response";
import {
  derivePublicOriginRejection,
  normalizePublicOrigin,
  toWorkspaceLocation,
} from "./public-origin";
import { loadWorkspaceRegistry, type RegisteredWorkspace } from "./registry";
import { recordWebSocketCrossing } from "./websocket-wire-log";
import { registerWorkspaceResourceRoutes } from "./workspace-resource-routes";
import { WorkspaceResourceTransport } from "./workspace-resource-transport";
import { registerWorkspaceRoutes } from "./workspace-routes";
import type { WebSocketShutdownMessage } from "../websocket-messages";

const log = createLogger("server-websocket");
const ShutdownMessage = "Server is shutting down; reconnecting…";

export interface ServerWorkspaceDependencies {
  readonly contentTransportRegistrar: ContentTransportRegistrar;
}

export interface CreateServerHostOptions {
  readonly registryPath: string;
  readonly publicOrigin: string | URL;
  readonly assetRoot: string;
  readonly bootWorkspace: (
    workspace: RegisteredWorkspace,
    dependencies: ServerWorkspaceDependencies,
  ) => Promise<WorkspaceRuntime>;
}

interface ServerListenOptions {
  readonly host: string;
  readonly port: number;
}

export interface ServerHost extends AsyncDisposable {
  listen(options: ServerListenOptions): Promise<string>;
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
    workspaceStyles,
  ] = await Promise.all([
    loadWorkspaceRegistry(options.registryPath),
    readFile(join(options.assetRoot, "index.html"), "utf8"),
    readFile(join(options.assetRoot, "assets/launcher.js"), "utf8"),
    readFile(join(options.assetRoot, "assets/launcher.css"), "utf8"),
    readFile(join(options.assetRoot, "workspace.html"), "utf8"),
    readFile(join(options.assetRoot, "assets/workspace.js"), "utf8"),
    readFile(join(options.assetRoot, "assets/workspace.css"), "utf8"),
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
  const resourceTransport = new WorkspaceResourceTransport();
  const supervisor = new WorkspaceSupervisor({
    boot: async (workspaceId) => {
      let resourceRegistration: Disposable | undefined;
      try {
        const runtime = await options.bootWorkspace(
          registry.require(workspaceId),
          {
            contentTransportRegistrar: (handler) => {
              const registration = resourceTransport.register(
                workspaceId,
                handler,
              );
              resourceRegistration = registration;
              return registration;
            },
          },
        );
        // The runtime owns the returned registration after successful boot.
        resourceRegistration = undefined;
        return runtime;
      } catch (error) {
        resourceRegistration?.[Symbol.dispose]();
        throw error;
      }
    },
  });
  const app = Fastify({ logger: false });
  let isAdmissionOpen = true;

  try {
    app.addHook("onRequest", (request, reply, done) => {
      if (!isAdmissionOpen) {
        setMutableResponseHeaders(reply);
        void reply.code(503).send({
          code: "server_shutting_down",
          message: "Server is shutting down",
        });
        return;
      }
      const rejection = derivePublicOriginRejection(
        publicOrigin,
        request.headers.host,
        request.headers.origin,
      );
      if (!rejection) {
        done();
        return;
      }
      setMutableResponseHeaders(reply);
      void reply.code(rejection.status).send({
        code: rejection.code,
        message: rejection.message,
      });
    });
    await app.register(fastifyWebsocket, {
      options: { maxPayload: 1024 * 1024 },
      errorHandler(error, socket) {
        log.error({ err: error }, "websocket_handler_failed");
        socket.close(1011, "WebSocket connection failed");
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
      workspaceStyles,
      publicOrigin,
    );
    registerWorkspaceResourceRoutes(
      app,
      registry,
      supervisor,
      resourceTransport,
      publicOrigin,
    );
  } catch (error) {
    try {
      await disposeServer(app, supervisor);
    } catch (cleanupError) {
      throw new AggregateError(
        [error, cleanupError],
        "Server host creation failed and cleanup was incomplete",
        { cause: cleanupError },
      );
    }
    throw error;
  }

  let disposal: Promise<void> | undefined;
  return {
    listen: (listenOptions) => app.listen(listenOptions),
    [Symbol.asyncDispose](): Promise<void> {
      if (!disposal) {
        isAdmissionOpen = false;
        sendServerShutdownMessages(app);
        disposal = disposeServer(app, supervisor);
      }
      return disposal;
    },
  };
}

function sendServerShutdownMessages(app: FastifyInstance): void {
  const message: WebSocketShutdownMessage = {
    type: "shutdown",
    message: ShutdownMessage,
  };
  const encodedMessage = JSON.stringify(message);
  for (const socket of app.websocketServer.clients) {
    if (socket.readyState !== socket.OPEN) continue;
    try {
      recordWebSocketCrossing(log, "out:shutdown", message);
      socket.send(encodedMessage);
    } catch (error) {
      log.warn({ err: error }, "websocket_shutdown_notification_failed");
    }
  }
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
