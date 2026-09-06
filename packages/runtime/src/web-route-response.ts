// Adapts validated viewpoint web results into browser responses without changing their bodies.

import type { ViewpointWebResponse } from "./workspace";

/** Apply response content type and cache policy without rewriting the handler's body. */
export function toWebRouteResponse(response: ViewpointWebResponse): Response {
  return new Response(response.body, {
    status: response.status,
    headers: {
      "Content-Type":
        response.content === "html-document"
          ? "text/html; charset=utf-8"
          : "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
