import { type TObject, Type } from "typebox";
import { describe, expect, expectTypeOf, it } from "vitest";

import {
  defineWebRoute,
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
});
