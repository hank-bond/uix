import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  createLocalDocumentStore,
  createLocalDocumentStoreFactory,
  createViewpointDocumentStoreFactory,
} from "./document-store";

async function tempRoot(): Promise<string> {
  return mkdtemp(join(tmpdir(), "doc-store-"));
}

describe("createLocalDocumentStore", () => {
  it("stores current document bytes under a namespace", async () => {
    const root = await tempRoot();
    const store = createLocalDocumentStore(root, {
      namespace: "canvas",
      extension: "html",
    });

    await store.setCurrent("reports/security", "<p>hello</p>");

    expect(await store.getCurrent("reports/security")).toBe("<p>hello</p>");
    await expect(
      readFile(
        join(
          root,
          ".uix",
          "documents",
          "current",
          "canvas",
          "reports",
          "security",
          "document.html",
        ),
        "utf8",
      ),
    ).resolves.toBe("<p>hello</p>");
  });

  it("creates immutable versions from supplied content and metadata", async () => {
    const root = await tempRoot();
    const store = createLocalDocumentStore(root, { namespace: "canvas" });

    const first = await store.createSnapshot("main", "first", {
      anchors: ["a"],
    });
    const duplicate = await store.createSnapshot("main", "first", {
      anchors: ["a"],
    });
    await store.setCurrent("main", "second");
    const loaded = await store.getVersion("main", first.id);

    expect(duplicate).toEqual(first);
    expect(loaded).toEqual(first);
    expect(loaded).toMatchObject({
      documentId: "main",
      content: "first",
      meta: { anchors: ["a"] },
    });
    expect(await store.getCurrent("main")).toBe("second");
  });

  it("isolates mutable viewpoint content while sharing immutable versions", async () => {
    const documents = createLocalDocumentStoreFactory(await tempRoot());
    const first = createViewpointDocumentStoreFactory(
      documents,
      "session-a",
    ).createStore({ namespace: "canvas" });
    const second = createViewpointDocumentStoreFactory(
      documents,
      "session-b",
    ).createStore({ namespace: "canvas" });

    await first.setCurrent("main", "first viewpoint");
    expect(await second.getCurrent("main")).toBeNull();

    const version = await first.createSnapshot("main", "shared", {
      anchors: ["a"],
    });
    await expect(second.getVersion("main", version.id)).resolves.toEqual(
      version,
    );
  });

  it("validates document ids before touching storage", async () => {
    const store = createLocalDocumentStore(await tempRoot(), {
      namespace: "canvas",
      validateDocumentId(documentId) {
        if (documentId !== "main") throw new Error(`bad id: ${documentId}`);
      },
    });

    await expect(store.getCurrent("other")).rejects.toThrow("bad id: other");
    await expect(store.setCurrent("other", "x")).rejects.toThrow(
      "bad id: other",
    );
  });
});
