import { describe, expect, it } from "vitest";

import type { DocumentStore, DocumentVersion } from "#backend/documents/store";

import { createCanvasResourceContributions } from "./resources";

function memoryStore(initial: Record<string, string> = {}): DocumentStore {
  const current = new Map(Object.entries(initial));
  return {
    getCurrent: (documentId) =>
      Promise.resolve(current.get(documentId) ?? null),
    setCurrent: (documentId, content) => {
      current.set(documentId, content);
      return Promise.resolve();
    },
    snapshotCurrent: (documentId, meta) =>
      Promise.resolve({
        id: "v1",
        documentId,
        content: current.get(documentId) ?? "",
        meta,
        createdAt: new Date(0).toISOString(),
      }),
    getVersion: <TMeta>() =>
      Promise.resolve(null as DocumentVersion<TMeta> | null),
  };
}

describe("createCanvasResourceContributions", () => {
  it("serves current canvas HTML with the writeback shim", async () => {
    const [resource] = createCanvasResourceContributions(
      memoryStore({ main: "<p>Hello</p>" }),
    );

    const response = await resource.handle(new Request("uix-canvas://main/"));
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe(
      "text/html; charset=utf-8",
    );
    expect(html).toContain("<p>Hello</p>");
    expect(html).toContain("uix:canvas-writeback");
  });

  it("returns a small 404 page when the canvas is missing", async () => {
    const [resource] = createCanvasResourceContributions(memoryStore());

    const response = await resource.handle(new Request("uix-canvas://main/"));

    expect(response.status).toBe(404);
    await expect(response.text()).resolves.toContain("No canvas yet");
  });
});
