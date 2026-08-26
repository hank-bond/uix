// Registers the server launcher's HTTP routes.

import type { FastifyInstance } from "fastify";

import type { WorkspaceCatalog } from "@uix/host";

import { setMutableResponseHeaders } from "./mutable-response";

const LauncherContentSecurityPolicy = [
  "default-src 'none'",
  "script-src 'self'",
  "style-src 'self'",
  "connect-src 'self'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'",
].join("; ");

export function registerLauncherRoutes(
  app: FastifyInstance,
  catalog: WorkspaceCatalog,
  launcherHtml: string,
  launcherScript: string,
  launcherStyles: string,
): void {
  app.get("/", (_request, reply) => {
    setMutableResponseHeaders(reply);
    return reply
      .header("Content-Security-Policy", LauncherContentSecurityPolicy)
      .type("text/html; charset=utf-8")
      .send(launcherHtml);
  });

  app.get("/api/catalog", (_request, reply) => {
    setMutableResponseHeaders(reply);
    return reply.send(catalog);
  });

  app.get("/assets/launcher.js", (_request, reply) => {
    setMutableResponseHeaders(reply);
    return reply.type("text/javascript; charset=utf-8").send(launcherScript);
  });

  app.get("/assets/launcher.css", (_request, reply) => {
    setMutableResponseHeaders(reply);
    return reply.type("text/css; charset=utf-8").send(launcherStyles);
  });
}
