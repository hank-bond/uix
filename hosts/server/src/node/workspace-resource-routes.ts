// Serves logical workspace resources over HTTP with request-owned runtime authority.

import { Readable } from "node:stream";

import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

import type { WorkspaceSupervisor } from "@uix/host";

import type { WorkspaceRegistry } from "./registry";
import { WorkspaceResourceRoute } from "./routes";
import type { WorkspaceResourceTransport } from "./workspace-resource-transport";
import { parseServerResourceRequestUrl } from "../resource-urls";

interface WorkspaceResourceParams {
  readonly workspaceId: string;
}

/** Register the server content plane independently from live attachments. */
export function registerWorkspaceResourceRoutes(
  app: FastifyInstance,
  registry: WorkspaceRegistry,
  supervisor: WorkspaceSupervisor,
  transport: WorkspaceResourceTransport,
  publicOrigin: string,
): void {
  app.get<{ Params: WorkspaceResourceParams }>(
    WorkspaceResourceRoute,
    async (request, reply) => {
      const registered = requireRegisteredWorkspace(
        registry,
        request.params.workspaceId,
        reply,
      );
      if (!registered) return reply;

      let logical: URL;
      try {
        if (!request.raw.url)
          throw new Error("Resource request URL is missing");
        logical = parseServerResourceRequestUrl(request.raw.url, registered.id);
      } catch (error) {
        return sendResourceError(
          reply,
          400,
          error instanceof Error ? error.message : String(error),
        );
      }

      let workspaceGuard:
        | Awaited<ReturnType<WorkspaceSupervisor["acquire"]>>
        | undefined;
      let releaseOnResponse = false;
      try {
        workspaceGuard = await supervisor.acquire(
          registered.id,
          `server-resource:${registered.id}`,
        );
        const resourceResponse = await transport.dispatch(
          registered.id,
          new Request(logical, {
            headers: toWebHeaders(request),
          }),
        );
        const body = resourceResponse.body
          ? Readable.fromWeb(resourceResponse.body)
          : undefined;
        applyResourceResponseHeaders(
          reply,
          resourceResponse,
          request.headers.origin,
          publicOrigin,
        );
        reply.code(resourceResponse.status);

        const guard = workspaceGuard;
        const release = (): void => {
          reply.raw.off("finish", release);
          reply.raw.off("close", release);
          guard[Symbol.dispose]();
        };
        reply.raw.once("finish", release);
        reply.raw.once("close", release);
        workspaceGuard = undefined;
        releaseOnResponse = true;
        try {
          return await reply.send(body);
        } catch (error) {
          release();
          throw error;
        }
      } catch (error) {
        if (releaseOnResponse) throw error;
        return await sendResourceError(
          reply,
          500,
          error instanceof Error ? error.message : String(error),
        );
      } finally {
        workspaceGuard?.[Symbol.dispose]();
      }
    },
  );
}

function requireRegisteredWorkspace(
  registry: WorkspaceRegistry,
  workspaceId: string,
  reply: FastifyReply,
): ReturnType<WorkspaceRegistry["require"]> | undefined {
  try {
    return registry.require(workspaceId);
  } catch {
    sendResourceError(reply, 404, "Workspace not found");
    return undefined;
  }
}

function toWebHeaders(request: FastifyRequest): Headers {
  const headers = new Headers();
  for (const [name, value] of Object.entries(request.headers)) {
    if (typeof value === "string") headers.set(name, value);
    else if (Array.isArray(value)) {
      for (const item of value) headers.append(name, item);
    }
  }
  return headers;
}

function applyResourceResponseHeaders(
  reply: FastifyReply,
  response: Response,
  requestOrigin: string | undefined,
  publicOrigin: string,
): void {
  const retainedVary = (response.headers.get("vary") ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter((value) => value !== "" && value.toLowerCase() !== "origin");
  for (const [name, value] of response.headers) {
    const normalized = name.toLowerCase();
    if (normalized.startsWith("access-control-") || normalized === "vary") {
      continue;
    }
    reply.header(name, value);
  }
  if (!response.headers.has("cache-control")) {
    reply.header("Cache-Control", "no-store");
  }
  reply
    .header("Referrer-Policy", "no-referrer")
    .header("X-Content-Type-Options", "nosniff");
  if (requestOrigin === publicOrigin) {
    reply.header("Access-Control-Allow-Origin", publicOrigin);
  }
  retainedVary.push("Origin");
  reply.header("Vary", retainedVary.join(", "));
}

function sendResourceError(
  reply: FastifyReply,
  status: number,
  message: string,
): FastifyReply {
  return reply
    .code(status)
    .header("Cache-Control", "no-store")
    .header("Referrer-Policy", "no-referrer")
    .header("X-Content-Type-Options", "nosniff")
    .type("text/plain; charset=utf-8")
    .send(message);
}
