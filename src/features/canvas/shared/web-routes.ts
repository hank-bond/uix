// The Canvas schema-only viewpoint web route contracts.

import { Type } from "typebox";

import { defineWebRoute } from "@uix/api/web-routes";

export const CanvasDocumentRoute = defineWebRoute({
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
  responses: {
    200: { content: "html-document" },
  },
});
