// Composes one server host over Fastify routes, workspace supervision, and deterministic disposal.

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
import { createLogger } from "@uix/runtime/log";

import { registerLauncherRoutes } from "./launcher-routes";
import { normalizePublicOrigin, toWorkspaceLocation } from "./public-origin";
import { loadWorkspaceRegistry, type RegisteredWorkspace } from "./registry";
import { registerWorkspaceRoutes } from "./workspace-routes";

const log = createLogger("server-live");

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

  try {
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
      disposal ??= disposeServer(app, supervisor);
      return disposal;
    },
  };
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
