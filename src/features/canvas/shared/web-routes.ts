// The Canvas schema-only viewpoint web route contracts.

import { Type } from "typebox";

import { defineWebRoute } from "@uix/api/web-routes";

import { CanvasKeySchema } from "./addressing";

export const CanvasDocumentRoute = defineWebRoute({
  method: "GET",
  path: "/view",
  query: Type.Object({ key: CanvasKeySchema }, { additionalProperties: false }),
  responses: {
    200: { content: "html-document" },
  },
});
