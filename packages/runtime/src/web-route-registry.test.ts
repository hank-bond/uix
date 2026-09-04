import { Type } from "typebox";
import { describe, expect, it, vi } from "vitest";

import {
  defineWebRoute,
  type WebRouteHandler,
  type WebRouteResponse,
  withWebRouteHandler,
} from "@uix/api/web-routes";

import {
  registerWebRouteContracts,
  registerWebRouteHandlers,
  WebRouteContractRegistry,
  WebRouteHandlerRegistry,
} from "./web-route-registry";

const DocumentRoute = defineWebRoute({
  method: "GET",
  path: "/documents/:key*",
  params: Type.Object(
    {
      key: Type.Array(Type.String({ pattern: "^[a-z0-9-]+$" }), {
        minItems: 1,
      }),
    },
    { additionalProperties: false },
  ),
  query: Type.Object(
    { version: Type.Optional(Type.String()) },
    { additionalProperties: false },
  ),
  responses: { 200: { content: "html-document" } },
});

type DocumentHandler = WebRouteHandler<typeof DocumentRoute>;

function request(
  pathname: string,
  search = "",
): {
  readonly method: "GET";
  readonly pathname: string;
  readonly searchParams: URLSearchParams;
} {
  return {
    method: "GET",
    pathname,
    searchParams: new URLSearchParams(search),
  };
}

async function invoke(
  contracts: WebRouteContractRegistry,
  handlers: WebRouteHandlerRegistry,
  webRequest: ReturnType<typeof request>,
): Promise<
  | { readonly ok: false; readonly status: 400 | 404; readonly reason: string }
  | { readonly ok: true; readonly value: WebRouteResponse }
> {
  const resolved = contracts.resolve("canvas", webRequest);
  if (!resolved.ok) return resolved;
  return {
    ok: true,
    value: await handlers.invoke(resolved.value, new AbortController().signal),
  };
}

describe("web route registries", () => {
  it("decodes typed path and query values within one namespace", async () => {
    const contracts = new WebRouteContractRegistry();
    const handlers = new WebRouteHandlerRegistry();
    const handler = vi.fn<DocumentHandler>(({ params, query }, respond) =>
      respond(200, `${params.key.join("/")}@${query.version ?? "current"}`),
    );

    registerWebRouteContracts(contracts, "canvas", [DocumentRoute]);
    registerWebRouteHandlers(handlers, "canvas", [
      withWebRouteHandler(DocumentRoute, handler),
    ]);

    await expect(
      invoke(
        contracts,
        handlers,
        request("/documents/reports/security", "version=v1"),
      ),
    ).resolves.toEqual({
      ok: true,
      value: {
        status: 200,
        content: "html-document",
        body: "reports/security@v1",
      },
    });
    expect(DocumentRoute).not.toHaveProperty("featureId");
    expect(handler).toHaveBeenCalledOnce();
    const [handlerRequest, boundResponder] = handler.mock.calls[0] ?? [];
    expect(handlerRequest.params).toEqual({
      key: ["reports", "security"],
    });
    expect(handlerRequest.query).toEqual({ version: "v1" });
    expect(handlerRequest.signal).toBeInstanceOf(AbortSignal);
    expect(typeof boundResponder).toBe("function");
  });

  it("rejects malformed route values before invoking a viewpoint handler", async () => {
    const contracts = new WebRouteContractRegistry();
    const handlers = new WebRouteHandlerRegistry();
    const handler = vi.fn<DocumentHandler>((_request, respond) =>
      respond(200, "not reached"),
    );
    registerWebRouteContracts(contracts, "canvas", [DocumentRoute]);
    registerWebRouteHandlers(handlers, "canvas", [
      withWebRouteHandler(DocumentRoute, handler),
    ]);

    await expect(
      invoke(contracts, handlers, request("/documents/Not-Valid")),
    ).resolves.toMatchObject({ ok: false, status: 400 });
    await expect(
      invoke(contracts, handlers, request("/documents/main", "extra=1")),
    ).resolves.toMatchObject({ ok: false, status: 400 });
    expect(handler).not.toHaveBeenCalled();
  });

  it("rolls back duplicate local route admission atomically", () => {
    const contracts = new WebRouteContractRegistry();

    expect(() =>
      registerWebRouteContracts(contracts, "canvas", [
        DocumentRoute,
        DocumentRoute,
      ]),
    ).toThrow("already registered");
    expect(contracts.listCanonicalIds()).toEqual([]);

    expect(() =>
      registerWebRouteContracts(contracts, "canvas", [DocumentRoute]),
    ).not.toThrow();
    expect(() =>
      registerWebRouteContracts(contracts, "review", [DocumentRoute]),
    ).not.toThrow();
    expect(() =>
      registerWebRouteContracts(contracts, "uix", [DocumentRoute]),
    ).not.toThrow();
    expect(contracts.listCanonicalIds()).toHaveLength(3);

    const handlers = new WebRouteHandlerRegistry();
    const contribution = withWebRouteHandler(
      DocumentRoute,
      (_request, respond) => respond(200, "document"),
    );
    expect(() =>
      registerWebRouteHandlers(handlers, "canvas", [
        contribution,
        contribution,
      ]),
    ).toThrow("already registered");
    expect(handlers.listCanonicalIds()).toEqual([]);
  });

  it("invokes the same admitted contract through independent viewpoint handlers", async () => {
    const contracts = new WebRouteContractRegistry();
    const first = new WebRouteHandlerRegistry();
    const second = new WebRouteHandlerRegistry();
    registerWebRouteContracts(contracts, "canvas", [DocumentRoute]);
    registerWebRouteHandlers(first, "canvas", [
      withWebRouteHandler(DocumentRoute, (_request, respond) =>
        respond(200, "first Agent"),
      ),
    ]);
    registerWebRouteHandlers(second, "canvas", [
      withWebRouteHandler(DocumentRoute, (_request, respond) =>
        respond(200, "second Agent"),
      ),
    ]);
    const resolved = contracts.resolve("canvas", request("/documents/main"));
    if (!resolved.ok) throw new Error(resolved.reason);

    await expect(
      first.invoke(resolved.value, new AbortController().signal),
    ).resolves.toMatchObject({ body: "first Agent" });
    await expect(
      second.invoke(resolved.value, new AbortController().signal),
    ).resolves.toMatchObject({ body: "second Agent" });
  });

  it("requires handlers to return a result issued by their bound responder", async () => {
    const contracts = new WebRouteContractRegistry();
    const handlers = new WebRouteHandlerRegistry();
    registerWebRouteContracts(contracts, "canvas", [DocumentRoute]);
    registerWebRouteHandlers(handlers, "canvas", [
      withWebRouteHandler(DocumentRoute, () => ({
        status: 200 as const,
        content: "html-document",
        body: "forged",
      })),
    ]);
    const resolved = contracts.resolve("canvas", request("/documents/main"));
    if (!resolved.ok) throw new Error(resolved.reason);

    await expect(
      handlers.invoke(resolved.value, new AbortController().signal),
    ).rejects.toThrow("bound responder");
  });
});
