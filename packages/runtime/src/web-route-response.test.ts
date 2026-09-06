import { describe, expect, it } from "vitest";

import { toWebRouteResponse } from "./web-route-response";

describe("web route response adaptation", () => {
  it.each([
    "",
    "<main>hello</main>",
    `<!doctype html>\r\n<html><head>\n  <link href='assets/site.css' rel='stylesheet'>\n</head><body>\n<a href='#details'>Details</a><a href='?key=reports/main'>Report</a>\n<script>fetch('api/data');</script>\n<p>café 日本語</p></body></html>`,
    `<base href="https://authored.example/"><base target="_blank"><a href="#section">jump</a>`,
  ])("serves the HTML body unchanged: %s", async (body) => {
    const response = toWebRouteResponse({
      status: 200,
      content: "html-document",
      body,
    });
    expect(response.status).toBe(200);
    expect(Object.fromEntries(response.headers)).toEqual({
      "cache-control": "no-store",
      "content-type": "text/html; charset=utf-8",
    });
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(
      new TextEncoder().encode(body),
    );
  });

  it.each([400, 404, 405, 500] as const)(
    "keeps %s errors as plain uncached text",
    async (status) => {
      const response = toWebRouteResponse({
        status,
        content: "text",
        body: "<not a document>",
      });
      expect(response.status).toBe(status);
      expect(Object.fromEntries(response.headers)).toEqual({
        "cache-control": "no-store",
        "content-type": "text/plain; charset=utf-8",
      });
      expect(await response.text()).toBe("<not a document>");
    },
  );
});
