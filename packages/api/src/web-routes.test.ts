import { Type } from "typebox";
import { describe, expect, expectTypeOf, it } from "vitest";

import { defineWebRoute, withWebRouteHandler } from "./web-routes";

const DocumentRoute = defineWebRoute({
  method: "GET",
  path: "/documents/:key*",
  params: Type.Object({
    key: Type.Array(Type.String()),
  }),
  query: Type.Object({
    version: Type.Optional(Type.String()),
  }),
  responses: {
    200: { content: "html-document" },
  },
});

describe("web route author contracts", () => {
  it("preserves one schema-only contract without routing identity", () => {
    expect(defineWebRoute(DocumentRoute)).toBe(DocumentRoute);
    expect(DocumentRoute).not.toHaveProperty("featureId");
    expect(DocumentRoute).not.toHaveProperty("workspaceId");
  });

  it("infers handler input and its complete document response", () => {
    const contribution = withWebRouteHandler(
      DocumentRoute,
      ({ params, query, signal }, respond) => {
        expectTypeOf(params.key).toEqualTypeOf<string[]>();
        expectTypeOf(query.version).toEqualTypeOf<string | undefined>();
        expectTypeOf(signal).toEqualTypeOf<AbortSignal>();
        return respond(200, params.key.join("/"));
      },
    );

    expect(contribution.contract).toBe(DocumentRoute);
    expect(contribution.handler).toBeTypeOf("function");
  });
});
