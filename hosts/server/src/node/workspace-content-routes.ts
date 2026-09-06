// Serves workspace resources and viewpoint routes over HTTP with request-owned runtime authority.

import { Readable } from "node:stream";

import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

import type { WorkspaceSupervisor } from "@uix/host";
import type { ContentRequest } from "@uix/runtime/content-transport";

import type { RegisteredWorkspace, WorkspaceRegistry } from "./registry";
import { WorkspaceResourceRoute, WorkspaceViewpointRoute } from "./routes";
import type { WorkspaceContentTransport } from "./workspace-content-transport";
import { parseServerResourceRequestUrl } from "../resource-urls";
import { decodeViewpointUrl } from "../viewpoint-urls";

interface WorkspaceContentParams {
  readonly workspaceId: string;
}

/** Install the server content plane independently from live attachments. */
export function installWorkspaceContentRoutes(
  app: FastifyInstance,
  registry: WorkspaceRegistry,
  supervisor: WorkspaceSupervisor,
  transport: WorkspaceContentTransport,
  publicOrigin: string,
): void {
  const serveContent = async (
    kind: ContentRequest["kind"],
    request: FastifyRequest<{ Params: WorkspaceContentParams }>,
    reply: FastifyReply,
  ): Promise<FastifyReply> => {
    let registered: RegisteredWorkspace;
    try {
      registered = registry.require(request.params.workspaceId);
    } catch {
      return sendContentError(reply, 404, "Workspace not found");
    }

    let contentRequest: ContentRequest;
    try {
      if (!request.raw.url) throw new Error("Content request URL is missing");
      if (kind === "viewpoint") {
        const url = new URL(request.raw.url, publicOrigin);
        const viewpoint = decodeViewpointUrl(url, registered.id);
        // Reject URL-parser aliases as well as non-shallow page locations.
        if (!viewpoint || `${url.pathname}${url.search}` !== request.raw.url) {
          return await sendContentError(
            reply,
            404,
            "Viewpoint location not found",
          );
        }
        contentRequest = {
          kind,
          request: { ...viewpoint, method: request.method },
        };
      } else {
        const logicalUrl = parseServerResourceRequestUrl(
          request.raw.url,
          registered.id,
        );
        contentRequest = {
          kind,
          request: new Request(logicalUrl, { headers: toWebHeaders(request) }),
        };
      }
    } catch (error) {
      return sendContentError(
        reply,
        kind === "viewpoint" ? 404 : 400,
        error instanceof Error ? error.message : String(error),
      );
    }

    using requestLifetime = new DisposableStack();
    let body: Readable | undefined;
    try {
      requestLifetime.use(
        await supervisor.acquire(
          registered.id,
          `server-content:${registered.id}`,
        ),
      );
      const response = await transport.dispatch(registered.id, contentRequest);
      // Accepted handler work outlives an HTTP disconnect. Cancel its unread body
      // rather than handing it to a closed reply.
      if (reply.raw.destroyed) {
        await response.body?.cancel();
        return await reply;
      }
      if (response.body) {
        body = requestLifetime.adopt(
          Readable.fromWeb(response.body),
          (stream) => {
            stream.destroy();
          },
        );
      }
      applyContentResponseHeaders(
        reply,
        response,
        request.headers.origin,
        publicOrigin,
      );
      reply.code(response.status);
    } catch (error) {
      return await sendContentError(
        reply,
        500,
        error instanceof Error ? error.message : String(error),
      );
    }
    // Fastify's reply is thenable through HTTP finish or close, not only send admission.
    // Keep the stream and workspace guard in this scope until that boundary settles.
    return await reply.send(body);
  };
  app.get<{ Params: WorkspaceContentParams }>(
    WorkspaceResourceRoute,
    (request, reply) => serveContent("resource", request, reply),
  );
  app.all<{ Params: WorkspaceContentParams }>(
    WorkspaceViewpointRoute,
    (request, reply) => serveContent("viewpoint", request, reply),
  );
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

function applyContentResponseHeaders(
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

function sendContentError(
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
