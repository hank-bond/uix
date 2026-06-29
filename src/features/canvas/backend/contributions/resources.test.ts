import { describe, expect, it } from "vitest";

import type { DocumentStore, DocumentVersion } from "#backend/documents/store";
import type { FeatureContext } from "#backend/features/context";
import type { CanvasContext } from "../context";
import { CanvasDocumentBuffer } from "../document-buffer";

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

function fakeCanvasContext(store: DocumentStore): CanvasContext {
  const base: FeatureContext = {
    documents: { createStore: () => store },
    channels: { publish: () => undefined },
  };
  return {
    ...base,
    store,
    buffer: new CanvasDocumentBuffer(store),
    openCanvasKeys: [],
    agentChangedCanvasKeys: new Set(),
  };
}

describe("createCanvasResourceContributions", () => {
  it("serves current canvas HTML with the writeback shim", async () => {
    const [resource] = createCanvasResourceContributions(
      fakeCanvasContext(memoryStore({ main: "<p>Hello</p>" })),
    );

    const response = await resource.handle({
      request: new Request("uix-resource://canvas.local/doc/main"),
      params: { key: ["main"] },
      query: {},
    });
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe(
      "text/html; charset=utf-8",
    );
    expect(html).toContain("<p>Hello</p>");
    expect(html).toContain("uix:canvas-writeback");
  });

  it("returns a small 404 page when the canvas is missing", async () => {
    const [resource] = createCanvasResourceContributions(
      fakeCanvasContext(memoryStore()),
    );

    const response = await resource.handle({
      request: new Request("uix-resource://canvas.local/doc/main"),
      params: { key: ["main"] },
      query: {},
    });

    expect(response.status).toBe(404);
    await expect(response.text()).resolves.toContain("No canvas yet");
  });
});
