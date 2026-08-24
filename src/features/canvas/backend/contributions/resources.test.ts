import { describe, expect, it } from "vitest";

import type { WorkspaceFeatureContext } from "@uix/api/feature";

import { createCanvasFrameResourceContributions } from "./resources";

const context = {
  log: {
    trace: () => undefined,
    debug: () => undefined,
    info: () => undefined,
    warn: () => undefined,
    error: () => undefined,
  },
} as unknown as WorkspaceFeatureContext;

describe("Canvas frame resource", () => {
  it("serves a static frame bootstrap for a valid key", async () => {
    const resource = createCanvasFrameResourceContributions(context)[0];

    const response = await resource.handler({
      request: new Request("uix-resource://canvas.local/main"),
      params: { key: ["reports", "weekly"] },
      query: {},
    });

    expect(response.status).toBe(200);
    const html = await response.text();
    expect(html).toContain("canvas:ready");
    expect(html).toContain("reports/weekly");
    expect(html).not.toContain("AgentInstance");
    const script = html.match(/<script>([\s\S]*)<\/script>/)?.[1];
    if (!script) throw new Error("Missing Canvas bootstrap script");
    // eslint-disable-next-line @typescript-eslint/no-implied-eval -- parse the generated standalone browser script without executing it.
    expect(() => new Function(script)).not.toThrow();
  });

  it("rejects an invalid key without reading Agent state", async () => {
    const resource = createCanvasFrameResourceContributions(context)[0];

    const response = await resource.handler({
      request: new Request("uix-resource://canvas.local/invalid"),
      params: { key: ["Not Valid"] },
      query: {},
    });

    expect(response.status).toBe(400);
  });
});
