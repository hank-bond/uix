import { type TObject, Type } from "typebox";
import { describe, expect, expectTypeOf, it } from "vitest";

import {
  createWebRouteClient,
  defineWebRoute,
  toWebRouteReference,
  type WebRouteContract,
  withWebRouteHandler,
} from "./web-routes";

const HtmlRoute = defineWebRoute({
  method: "GET",
  path: "/view",
  query: Type.Object({
    key: Type.String(),
    version: Type.Optional(Type.String()),
  }),
  responses: {
    200: { content: "html-document" },
  },
});

describe("web route author contracts", () => {
  it("derives the readonly declaration shape from the admission schema", () => {
    expectTypeOf<WebRouteContract>().toEqualTypeOf<{
      readonly method: "GET";
      readonly path: string;
      readonly params?: TObject;
      readonly query?: TObject;
      readonly responses: {
        readonly 200: { readonly content: "html-document" };
      };
    }>();
  });

  it("preserves one schema-only contract without routing identity", () => {
    expect(defineWebRoute(HtmlRoute)).toBe(HtmlRoute);
    expect(HtmlRoute).not.toHaveProperty("featureId");
    expect(HtmlRoute).not.toHaveProperty("workspaceId");
  });

  it("infers typed query input and its HTML response body", () => {
    const contribution = withWebRouteHandler(
      HtmlRoute,
      ({ params, query, signal }, respond) => {
        expectTypeOf(params).toEqualTypeOf<Record<string, never>>();
        expectTypeOf(query.key).toEqualTypeOf<string>();
        expectTypeOf(query.version).toEqualTypeOf<string | undefined>();
        expectTypeOf(signal).toEqualTypeOf<AbortSignal>();
        return respond(200, query.key);
      },
    );

    expect(contribution.contract).toBe(HtmlRoute);
    expect(contribution.handler).toBeTypeOf("function");
  });

  it("infers empty input objects when both schemas are omitted", () => {
    const route = defineWebRoute({
      method: "GET",
      path: "/",
      responses: { 200: { content: "html-document" } },
    });
    const contribution = withWebRouteHandler(
      route,
      ({ params, query }, respond) => {
        expectTypeOf(params).toEqualTypeOf<Record<string, never>>();
        expectTypeOf(query).toEqualTypeOf<Record<string, never>>();
        return respond(200, "<main>hello</main>");
      },
    );
    expect(contribution.contract).not.toHaveProperty("params");
    expect(contribution.contract).not.toHaveProperty("query");
  });

  it("preserves inference for an explicitly declared empty params schema", () => {
    const route = defineWebRoute({ ...HtmlRoute, params: Type.Object({}) });
    const contribution = withWebRouteHandler(
      route,
      ({ params: _params, query }, respond) => {
        expectTypeOf<keyof typeof _params>().toEqualTypeOf<never>();
        expectTypeOf(query.key).toEqualTypeOf<string>();
        return respond(200, query.key);
      },
    );
    expect(contribution.contract.params).toBe(route.params);
  });

  it("builds a typed directory-relative route reference", () => {
    expect(
      toWebRouteReference(HtmlRoute, {
        query: { key: "reports/main", version: "draft 1" },
      }),
    ).toBe("view?key=reports%2Fmain&version=draft+1");

    const rootRoute = defineWebRoute({
      method: "GET",
      path: "/",
      responses: { 200: { content: "html-document" } },
    });
    expect(toWebRouteReference(rootRoute)).toBe("./");

    const assertRejectedTypes = (): void => {
      // @ts-expect-error the declared query is required
      toWebRouteReference(HtmlRoute);
      // @ts-expect-error the query key must be a string
      toWebRouteReference(HtmlRoute, { query: { key: 1 } });
      // @ts-expect-error the route declares no path values
      toWebRouteReference(HtmlRoute, { params: {}, query: { key: "main" } });
    };
    expect(assertRejectedTypes).toBeTypeOf("function");
  });

  it("derives a physical page URL whose directory is the feature root", () => {
    const client = createWebRouteClient(
      HtmlRoute,
      "https://host.example/workspaces/w/viewpoints/old/canvas/",
    );
    const pageUrl = client.toUrl({ query: { key: "reports/main" } });

    expect(pageUrl).toBe(
      "https://host.example/workspaces/w/viewpoints/old/canvas/view?key=reports%2Fmain",
    );
    expect(new URL("assets/site.css", pageUrl).href).toBe(
      "https://host.example/workspaces/w/viewpoints/old/canvas/assets/site.css",
    );
    expect(new URL("api/data", pageUrl).href).toBe(
      "https://host.example/workspaces/w/viewpoints/old/canvas/api/data",
    );
    expect(new URL("#details", pageUrl).href).toBe(`${pageUrl}#details`);
    expect(new URL("?key=other", pageUrl).href).toBe(
      "https://host.example/workspaces/w/viewpoints/old/canvas/view?key=other",
    );
  });

  it("keeps retained clients tied to their original physical root", () => {
    const oldClient = createWebRouteClient(
      HtmlRoute,
      "uix-resource://old.canvas/",
    );
    const replacementClient = createWebRouteClient(
      HtmlRoute,
      "uix-resource://replacement.canvas/",
    );

    expect(oldClient.toUrl({ query: { key: "main" } })).toBe(
      "uix-resource://old.canvas/view?key=main",
    );
    expect(replacementClient.toUrl({ query: { key: "main" } })).toBe(
      "uix-resource://replacement.canvas/view?key=main",
    );
  });

  it("rejects a non-directory physical feature root", () => {
    expect(() =>
      createWebRouteClient(
        HtmlRoute,
        "https://host.example/workspaces/w/viewpoints/binding/canvas",
      ),
    ).toThrow("Expected a directory URL without query or fragment");
    expect(() =>
      createWebRouteClient(
        HtmlRoute,
        "https://host.example/workspaces/w/viewpoints/binding/canvas/?other=1",
      ),
    ).toThrow("Expected a directory URL without query or fragment");
  });
});
