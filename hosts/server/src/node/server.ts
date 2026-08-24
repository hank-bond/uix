// Composes the launcher HTTP service from one boot-loaded registry, public origin, and built browser assets.

import { readFile } from "node:fs/promises";
import { join } from "node:path";

import Fastify, { type FastifyInstance, type FastifyReply } from "fastify";

import {
  type WorkspaceCatalog,
  WorkspaceCatalogVersion,
} from "@uix/host/catalog";

import { normalizePublicOrigin, toWorkspaceLocation } from "./public-origin";
import { loadWorkspaceRegistry, type WorkspaceRegistry } from "./registry";

const LauncherContentSecurityPolicy = [
  "default-src 'none'",
  "script-src 'self'",
  "style-src 'self'",
  "connect-src 'self'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'",
].join("; ");

interface CreateServerHostOptions {
  readonly registryPath: string;
  readonly publicOrigin: string | URL;
  readonly assetRoot: string;
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

/** Create the launcher service without acquiring a workspace runtime. */
export async function createServerHost(
  options: CreateServerHostOptions,
): Promise<ServerHost> {
  const [registry, launcherHtml, launcherScript, launcherStyles] =
    await Promise.all([
      loadWorkspaceRegistry(options.registryPath),
      readFile(join(options.assetRoot, "index.html"), "utf8"),
      readFile(join(options.assetRoot, "assets/launcher.js"), "utf8"),
      readFile(join(options.assetRoot, "assets/launcher.css"), "utf8"),
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

  const app = Fastify({ logger: false });
  registerLauncherRoutes(
    app,
    catalog,
    launcherHtml,
    launcherScript,
    launcherStyles,
  );

  let disposal: Promise<void> | undefined;
  return {
    registry,
    listen: (listenOptions) => app.listen(listenOptions),
    [Symbol.asyncDispose](): Promise<void> {
      disposal ??= app.close();
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

function setMutableHeaders(reply: FastifyReply): void {
  reply
    .header("Cache-Control", "no-store")
    .header("Referrer-Policy", "no-referrer")
    .header("X-Content-Type-Options", "nosniff");
}
