// canvas resource contributions.

import { CanvasProtocolScheme, canvasHostToKey } from "../../shared/addressing";
import type {
  ResourceContribution,
  ResourceSchemeContribution,
} from "#backend/resources/registry";
import { createLogger } from "#backend/log";
import type { CanvasContext } from "../context";

import { injectCanvasShim } from "../shim";

const log = createLogger("canvas");

export const canvasResourceScheme: ResourceSchemeContribution = {
  id: "canvas.resource.scheme",
  scheme: CanvasProtocolScheme,
  privileges: {
    standard: true,
    secure: true,
    supportFetchAPI: true,
  },
};

export function createCanvasResourceContributions(
  ctx: CanvasContext,
): readonly ResourceContribution[] {
  return [
    {
      id: "canvas.resource.html",
      scheme: CanvasProtocolScheme,
      async handle(request) {
        const url = new URL(request.url);
        const key = canvasHostToKey(url.hostname);
        const html = key ? await ctx.store.getCurrent(key) : null;

        if (key && html !== null) {
          log.debug({ key }, "canvas_served");
          return htmlResponse(injectCanvasShim(html, key), 200);
        }

        log.debug({ key: key ?? url.hostname }, "canvas_not_found");
        return htmlResponse(notFoundHtml(key ?? url.hostname), 404);
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

function notFoundHtml(key: string): string {
  return `<!doctype html>
<meta charset="utf-8">
<title>Canvas not found</title>
<body style="font-family: system-ui, sans-serif; color: #777; padding: 24px;">
  <p>No canvas yet: <code>${escapeHtml(key)}</code></p>
</body>`;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (ch) => {
    switch (ch) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      case "'":
        return "&#39;";
      default:
        return ch;
    }
  });
}
