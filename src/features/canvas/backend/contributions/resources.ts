// Serves the static Canvas frame that receives selected-viewpoint HTML from its parent.

import type { WorkspaceFeatureContext } from "@uix/api/feature";
import type { ResourceContribution } from "@uix/api/resources";

import {
  CanvasFrameResourceName,
  CanvasFrameResourceRoute,
  parseCanvasKeyRouteParam,
} from "../../shared/addressing";
import { createCanvasFrameBootstrap } from "../shim";

export function createCanvasFrameResourceContributions(
  ctx: WorkspaceFeatureContext,
): readonly ResourceContribution[] {
  return [
    {
      name: CanvasFrameResourceName,
      route: CanvasFrameResourceRoute,
      handler({ params }) {
        const key = parseCanvasKeyRouteParam(params["key"]);
        if (!key) return htmlResponse("Invalid Canvas key", 400);
        ctx.log.debug({ key }, "canvas_frame_served");
        return htmlResponse(createCanvasFrameBootstrap(key), 200);
      },
    },
  ];
}

function htmlResponse(body: string, status: number): Response {
  return new Response(body, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": "text/html; charset=utf-8",
    },
  });
}
