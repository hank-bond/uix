// Serves the static Canvas iframe that receives selected-viewpoint HTML from its parent.

import type { WorkspaceFeatureContext } from "@uix/api/feature";
import type { ResourceContribution } from "@uix/api/resources";

import {
  CanvasIframeResourceName,
  CanvasIframeResourceRoute,
  parseCanvasKeyRouteParam,
} from "../../shared/addressing";
import { createCanvasIframeBootstrap } from "../iframe-bootstrap";

export function createCanvasIframeResourceContributions(
  ctx: WorkspaceFeatureContext,
): readonly ResourceContribution[] {
  return [
    {
      name: CanvasIframeResourceName,
      route: CanvasIframeResourceRoute,
      handler({ params }) {
        const key = parseCanvasKeyRouteParam(params["key"]);
        if (!key) return htmlResponse("Invalid Canvas key", 400);
        ctx.log.debug({ key }, "canvas_iframe_served");
        return htmlResponse(createCanvasIframeBootstrap(key), 200);
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
