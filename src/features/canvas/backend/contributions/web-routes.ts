// Canvas viewpoint web route handlers.

import type { WebRouteContribution } from "@uix/api/web-routes";
import { withWebRouteHandler } from "@uix/api/web-routes";

import { CanvasDocumentRoute } from "../../shared/web-routes";
import type { CanvasAgentInstanceContext } from "../agent-instance-context";

export function createCanvasWebRouteContributions(
  ctx: CanvasAgentInstanceContext,
): readonly WebRouteContribution[] {
  return [
    withWebRouteHandler(CanvasDocumentRoute, async ({ query }, respond) =>
      respond(200, await ctx.buffer.readHtml(query.key)),
    ),
  ];
}
