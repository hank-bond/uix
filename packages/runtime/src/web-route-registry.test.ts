import { Type } from "typebox";
import { describe, expect, it, vi } from "vitest";

import {
  defineWebRoute,
  type WebRouteContract,
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

const HtmlRoute = defineWebRoute({
  method: "GET",
  path: "/view",
  query: Type.Object(
    {
      key: Type.String({ pattern: "^[a-z0-9-]+(?:/[a-z0-9-]+)*$" }),
      version: Type.Optional(Type.String()),
    },
    { additionalProperties: false },
  ),
  responses: { 200: { content: "html-document" } },
});

type HtmlHandler = WebRouteHandler<typeof HtmlRoute>;

function toRouteRequest(
  pathname: string,
  search = "",
  method = "GET",
): {
  readonly method: string;
  readonly pathname: string;
  readonly searchParams: URLSearchParams;
} {
  return { method, pathname, searchParams: new URLSearchParams(search) };
}

async function invoke(
  contracts: WebRouteContractRegistry,
  handlers: WebRouteHandlerRegistry,
  request: ReturnType<typeof toRouteRequest>,
): Promise<
  | {
      readonly ok: false;
      readonly status: 400 | 404 | 405;
      readonly reason: string;
    }
  | { readonly ok: true; readonly value: WebRouteResponse }
> {
  const resolved = contracts.resolve("canvas", request);
  if (!resolved.ok) return resolved;
  return {
    ok: true,
    value: await handlers.invoke(resolved.value, new AbortController().signal),
  };
}

describe("web route registries", () => {
  it("admits a no-input page without empty schemas and rejects undeclared query input", async () => {
    const route = defineWebRoute({
      method: "GET",
      path: "/",
      responses: { 200: { content: "html-document" } },
    });
    const contracts = new WebRouteContractRegistry();
    const handlers = new WebRouteHandlerRegistry();
    const handler = vi.fn<WebRouteHandler<typeof route>>((_request, respond) =>
      respond(200, "<main>hello</main>"),
    );
    using _contracts = registerWebRouteContracts(contracts, "canvas", [route]);
    using _handlers = registerWebRouteHandlers(handlers, "canvas", [
      withWebRouteHandler(route, handler),
    ]);

    await expect(
      invoke(contracts, handlers, toRouteRequest("/")),
    ).resolves.toMatchObject({
      ok: true,
      value: { status: 200, body: "<main>hello</main>" },
    });
    expect(handler.mock.calls[0][0]).toMatchObject({ params: {}, query: {} });
    for (const query of [
      "key=main",
      "__proto__=1",
      "__proto__=1&__proto__=2",
    ]) {
      await expect(
        invoke(contracts, handlers, toRouteRequest("/", query)),
      ).resolves.toMatchObject({ ok: false, status: 400 });
    }
    expect(handler).toHaveBeenCalledOnce();
  });

  it("validates an explicitly supplied params schema", async () => {
    const route = defineWebRoute({
      ...HtmlRoute,
      params: Type.Object({}, { additionalProperties: false }),
    });
    const contracts = new WebRouteContractRegistry();
    const handlers = new WebRouteHandlerRegistry();
    using _contracts = registerWebRouteContracts(contracts, "canvas", [route]);
    using _handlers = registerWebRouteHandlers(handlers, "canvas", [
      withWebRouteHandler(route, ({ query }, respond) =>
        respond(200, query.key),
      ),
    ]);
    await expect(
      invoke(contracts, handlers, toRouteRequest("/view", "key=main")),
    ).resolves.toMatchObject({ ok: true, value: { body: "main" } });
  });

  it.each([
    { name: "an absent declaration", contract: undefined },
    { name: "a null declaration", contract: null },
    { name: "an array declaration", contract: [] },
    { name: "missing required fields", contract: {} },
    {
      name: "an unsupported method",
      contract: { ...HtmlRoute, method: "POST" },
    },
    { name: "an absent method", contract: { ...HtmlRoute, method: undefined } },
    { name: "a non-string path", contract: { ...HtmlRoute, path: 1 } },
    { name: "an absent path", contract: { ...HtmlRoute, path: undefined } },
    { name: "null params", contract: { ...HtmlRoute, params: null } },
    {
      name: "a non-object params schema",
      contract: { ...HtmlRoute, params: Type.String() },
    },
    {
      name: "params data instead of a schema",
      contract: { ...HtmlRoute, params: {} },
    },
    { name: "null query", contract: { ...HtmlRoute, query: null } },
    {
      name: "a non-object query schema",
      contract: { ...HtmlRoute, query: Type.String() },
    },
    {
      name: "query data instead of a schema",
      contract: { ...HtmlRoute, query: {} },
    },
    {
      name: "request headers",
      contract: { ...HtmlRoute, headers: Type.Object({}) },
    },
    { name: "a request body", contract: { ...HtmlRoute, body: Type.String() } },
    {
      name: "an undefined unsupported field",
      contract: { ...HtmlRoute, body: undefined },
    },
    {
      name: "authored routing identity",
      contract: { ...HtmlRoute, featureId: "canvas" },
    },
    {
      name: "absent responses",
      contract: { ...HtmlRoute, responses: undefined },
    },
    { name: "null responses", contract: { ...HtmlRoute, responses: null } },
    { name: "array responses", contract: { ...HtmlRoute, responses: [] } },
    {
      name: "an empty response map",
      contract: { ...HtmlRoute, responses: {} },
    },
    {
      name: "an unsupported status",
      contract: {
        ...HtmlRoute,
        responses: { 201: { content: "html-document" } },
      },
    },
    {
      name: "an additional status",
      contract: {
        ...HtmlRoute,
        responses: {
          ...HtmlRoute.responses,
          404: { content: "html-document" },
        },
      },
    },
    {
      name: "an absent response descriptor",
      contract: { ...HtmlRoute, responses: { 200: undefined } },
    },
    {
      name: "a null response descriptor",
      contract: { ...HtmlRoute, responses: { 200: null } },
    },
    {
      name: "an empty response descriptor",
      contract: { ...HtmlRoute, responses: { 200: {} } },
    },
    {
      name: "an unsupported response content kind",
      contract: { ...HtmlRoute, responses: { 200: { content: "text" } } },
    },
    {
      name: "response headers",
      contract: {
        ...HtmlRoute,
        responses: {
          200: { content: "html-document", headers: Type.Object({}) },
        },
      },
    },
    {
      name: "undefined response headers",
      contract: {
        ...HtmlRoute,
        responses: { 200: { content: "html-document", headers: undefined } },
      },
    },
    {
      name: "an unknown response field",
      contract: {
        ...HtmlRoute,
        responses: { 200: { content: "html-document", typo: true } },
      },
    },
  ])(
    "rejects $name and rolls back both contribution groups",
    ({ contract }) => {
      // Source-loaded JavaScript can bypass the author-facing TypeScript type.
      const invalid = contract as unknown as WebRouteContract;
      const contracts = new WebRouteContractRegistry();
      expect(() => {
        using _contracts = registerWebRouteContracts(contracts, "canvas", [
          HtmlRoute,
          invalid,
        ]);
      }).toThrow("Invalid web route contract");
      expect(contracts.listCanonicalIds()).toEqual([]);

      const handlers = new WebRouteHandlerRegistry();
      const handler = vi.fn(() => {
        throw new Error("not reached");
      });
      expect(() => {
        using _handlers = registerWebRouteHandlers(handlers, "canvas", [
          { contract: HtmlRoute, handler },
          { contract: invalid, handler },
        ]);
      }).toThrow("Invalid web route contract");
      expect(handlers.listCanonicalIds()).toEqual([]);
      expect(handler).not.toHaveBeenCalled();
    },
  );

  it("reports the schema failure's input location", () => {
    const contracts = new WebRouteContractRegistry();
    expect(() => {
      using _contract = contracts.register("canvas", {
        ...HtmlRoute,
        query: null,
      } as unknown as WebRouteContract);
    }).toThrow(
      "Invalid web route contract at /query: Expected a Type.Object schema",
    );
    expect(() => {
      using _contract = contracts.register("canvas", {
        ...HtmlRoute,
        responses: { 200: { content: "text" } },
      } as unknown as WebRouteContract);
    }).toThrow("Invalid web route contract at /responses/200/content:");
  });

  it("preserves authored schemas without running their refinements during admission", async () => {
    const refinement = vi.fn((key: string) => key === "main");
    const query = Type.Object(
      { key: Type.Refine(Type.String(), refinement) },
      { additionalProperties: false },
    );
    const route = defineWebRoute({ ...HtmlRoute, query });
    const contracts = new WebRouteContractRegistry();
    const handlers = new WebRouteHandlerRegistry();
    const contribution = withWebRouteHandler(route, ({ query }, respond) =>
      respond(200, query.key),
    );
    using _contracts = registerWebRouteContracts(contracts, "canvas", [route]);
    using _handlers = registerWebRouteHandlers(handlers, "canvas", [
      contribution,
    ]);
    expect(contribution.contract).toBe(route);
    expect(route.query).toBe(query);
    expect(refinement).not.toHaveBeenCalled();
    await expect(
      invoke(contracts, handlers, toRouteRequest("/view", "key=main")),
    ).resolves.toMatchObject({ ok: true, value: { body: "main" } });
    expect(refinement).toHaveBeenCalled();
    await expect(
      invoke(contracts, handlers, toRouteRequest("/view", "key=other")),
    ).resolves.toMatchObject({ ok: false, status: 400 });
  });

  it.each(["/", "/view", "/report.html", "/%76iew"])(
    "admits the shallow HTML path %s",
    (path) => {
      const contracts = new WebRouteContractRegistry();
      using _contract = contracts.register("canvas", { ...HtmlRoute, path });
      expect(
        contracts.resolve("canvas", toRouteRequest(path, "key=main")),
      ).toMatchObject({ ok: true });
    },
  );

  it.each([
    "",
    "view",
    "/view/",
    "//view",
    "/reports/view",
    "/:key",
    "/:key*",
    "/*",
    "/.",
    "/..",
    "/%2e",
    "/.%2e",
    "/%2E%2e",
    "/view%2Fother",
    "/view%5Cother",
    "/view\\other",
    "/view?key=main",
    "/view#details",
    "/%",
  ])("rejects HTML path %s and rolls back the contribution group", (path) => {
    const contracts = new WebRouteContractRegistry();
    const invalid = { ...HtmlRoute, path };
    expect(() => {
      using _contracts = registerWebRouteContracts(contracts, "canvas", [
        HtmlRoute,
        invalid,
      ]);
    }).toThrow("expected / or one literal, non-dot segment such as /view");
    expect(contracts.listCanonicalIds()).toEqual([]);

    const handlers = new WebRouteHandlerRegistry();
    const handler: HtmlHandler = (_request, respond) =>
      respond(200, "not reached");
    expect(() => {
      using _handlers = registerWebRouteHandlers(handlers, "canvas", [
        withWebRouteHandler(HtmlRoute, handler),
        withWebRouteHandler<typeof invalid>(invalid, handler),
      ]);
    }).toThrow("Put content identifiers in query input");
    expect(handlers.listCanonicalIds()).toEqual([]);
  });

  it("decodes typed query values within one namespace", async () => {
    const contracts = new WebRouteContractRegistry();
    const handlers = new WebRouteHandlerRegistry();
    const handler = vi.fn<HtmlHandler>(({ query }, respond) =>
      respond(200, `${query.key}@${query.version ?? "current"}`),
    );
    using _contracts = registerWebRouteContracts(contracts, "canvas", [
      HtmlRoute,
    ]);
    using _handlers = registerWebRouteHandlers(handlers, "canvas", [
      withWebRouteHandler(HtmlRoute, handler),
    ]);

    await expect(
      invoke(
        contracts,
        handlers,
        toRouteRequest("/view", "key=reports%2Fsecurity&version=v1"),
      ),
    ).resolves.toEqual({
      ok: true,
      value: {
        status: 200,
        content: "html-document",
        body: "reports/security@v1",
      },
    });
    expect(HtmlRoute).not.toHaveProperty("featureId");
    expect(handler).toHaveBeenCalledOnce();
    const [request, responder] = handler.mock.calls[0];
    expect(request.params).toEqual({});
    expect(request.query).toEqual({ key: "reports/security", version: "v1" });
    expect(request.signal).toBeInstanceOf(AbortSignal);
    expect(typeof responder).toBe("function");
  });

  it("returns a method mismatch before validating another method's input", async () => {
    const contracts = new WebRouteContractRegistry();
    const handlers = new WebRouteHandlerRegistry();
    const handler = vi.fn<HtmlHandler>((_request, respond) =>
      respond(200, "not reached"),
    );
    using _contracts = registerWebRouteContracts(contracts, "canvas", [
      HtmlRoute,
    ]);
    using _handlers = registerWebRouteHandlers(handlers, "canvas", [
      withWebRouteHandler(HtmlRoute, handler),
    ]);

    await expect(
      invoke(
        contracts,
        handlers,
        toRouteRequest("/view", "unexpected=1", "POST"),
      ),
    ).resolves.toEqual({
      ok: false,
      status: 405,
      reason: "Web route method is not allowed.",
    });
    expect(handler).not.toHaveBeenCalled();
  });

  it.each([
    "",
    "key=",
    "key=Not-Valid",
    "key=main&key=other",
    "key=main&extra=1",
    "key=main&__proto__=1",
    "key=main&__proto__=1&__proto__=2",
    "key=reports//main",
    "key=../main",
    "key=%FF",
  ])("rejects invalid query %s before invoking a handler", async (query) => {
    const contracts = new WebRouteContractRegistry();
    const handlers = new WebRouteHandlerRegistry();
    const handler = vi.fn<HtmlHandler>((_request, respond) =>
      respond(200, "not reached"),
    );
    using _contracts = registerWebRouteContracts(contracts, "canvas", [
      HtmlRoute,
    ]);
    using _handlers = registerWebRouteHandlers(handlers, "canvas", [
      withWebRouteHandler(HtmlRoute, handler),
    ]);

    await expect(
      invoke(contracts, handlers, toRouteRequest("/view", query)),
    ).resolves.toMatchObject({ ok: false, status: 400 });
    expect(handler).not.toHaveBeenCalled();
  });

  it.each([
    "/view/",
    "//view",
    "/view//",
    "/reports/view",
    "/documents/main",
    "view",
    "",
    "//",
  ])(
    "rejects page location alias %s before invoking a handler",
    async (pathname) => {
      const contracts = new WebRouteContractRegistry();
      const handlers = new WebRouteHandlerRegistry();
      const handler = vi.fn<HtmlHandler>((_request, respond) =>
        respond(200, "not reached"),
      );
      const rootRoute = { ...HtmlRoute, path: "/" };
      using _contracts = registerWebRouteContracts(contracts, "canvas", [
        HtmlRoute,
        rootRoute,
      ]);
      using _handlers = registerWebRouteHandlers(handlers, "canvas", [
        withWebRouteHandler(HtmlRoute, handler),
        withWebRouteHandler<typeof rootRoute>(rootRoute, handler),
      ]);

      await expect(
        invoke(contracts, handlers, toRouteRequest(pathname, "key=main")),
      ).resolves.toMatchObject({ ok: false, status: 404 });
      expect(handler).not.toHaveBeenCalled();
    },
  );

  it("rejects malformed path encoding and undeclared path parameters", () => {
    const contracts = new WebRouteContractRegistry();
    using _contract = contracts.register("canvas", HtmlRoute);
    expect(
      contracts.resolve("canvas", toRouteRequest("/%", "key=main")),
    ).toMatchObject({ ok: false, status: 400 });
    expect(() => {
      using _invalid = contracts.register("other", {
        ...HtmlRoute,
        params: Type.Object({ key: Type.String() }),
      });
    }).toThrow("path params do not match their schema");
  });

  it("rolls back duplicate local route admission atomically", () => {
    const contracts = new WebRouteContractRegistry();
    expect(() => {
      using _duplicates = registerWebRouteContracts(contracts, "canvas", [
        HtmlRoute,
        HtmlRoute,
      ]);
    }).toThrow("already registered");
    expect(contracts.listCanonicalIds()).toEqual([]);

    using _canvas = registerWebRouteContracts(contracts, "canvas", [HtmlRoute]);
    using _review = registerWebRouteContracts(contracts, "review", [HtmlRoute]);
    using _substrate = registerWebRouteContracts(contracts, "uix", [HtmlRoute]);
    expect(contracts.listCanonicalIds()).toHaveLength(3);
    expect(() => {
      using _duplicate = registerWebRouteContracts(contracts, "canvas", [
        { ...HtmlRoute, path: "/%76iew" },
      ]);
    }).toThrow("already registered");

    const handlers = new WebRouteHandlerRegistry();
    const contribution = withWebRouteHandler(HtmlRoute, (_request, respond) =>
      respond(200, "HTML"),
    );
    expect(() => {
      using _duplicates = registerWebRouteHandlers(handlers, "canvas", [
        contribution,
        contribution,
      ]);
    }).toThrow("already registered");
    expect(handlers.listCanonicalIds()).toEqual([]);
  });

  it("invokes the same admitted contract through independent viewpoint handlers", async () => {
    const contracts = new WebRouteContractRegistry();
    const first = new WebRouteHandlerRegistry();
    const second = new WebRouteHandlerRegistry();
    using _contracts = registerWebRouteContracts(contracts, "canvas", [
      HtmlRoute,
    ]);
    using _first = registerWebRouteHandlers(first, "canvas", [
      withWebRouteHandler(HtmlRoute, (_request, respond) =>
        respond(200, "first Agent"),
      ),
    ]);
    using _second = registerWebRouteHandlers(second, "canvas", [
      withWebRouteHandler(HtmlRoute, (_request, respond) =>
        respond(200, "second Agent"),
      ),
    ]);
    const resolved = contracts.resolve(
      "canvas",
      toRouteRequest("/view", "key=main"),
    );
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
    using _contracts = registerWebRouteContracts(contracts, "canvas", [
      HtmlRoute,
    ]);
    using _handlers = registerWebRouteHandlers(handlers, "canvas", [
      withWebRouteHandler(HtmlRoute, () => ({
        status: 200 as const,
        content: "html-document",
        body: "forged",
      })),
    ]);
    const resolved = contracts.resolve(
      "canvas",
      toRouteRequest("/view", "key=main"),
    );
    if (!resolved.ok) throw new Error(resolved.reason);

    await expect(
      handlers.invoke(resolved.value, new AbortController().signal),
    ).rejects.toThrow("bound responder");
  });
});
