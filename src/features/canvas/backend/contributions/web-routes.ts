// Canvas viewpoint web route handlers.

import type { WebRouteContribution } from "@uix/api/web-routes";
import { withWebRouteHandler } from "@uix/api/web-routes";

import { parseCanvasKey } from "../../shared/addressing";
import { CanvasDocumentRoute } from "../../shared/web-routes";
import type { CanvasAgentInstanceContext } from "../agent-instance-context";

export function createCanvasWebRouteContributions(
  ctx: CanvasAgentInstanceContext,
): readonly WebRouteContribution[] {
  return [
    withWebRouteHandler(CanvasDocumentRoute, async ({ params }, respond) => {
      const key = parseCanvasKey(params.key.join("/"));
      return respond(200, await ctx.buffer.readHtml(key));
    }),
  ];
}
