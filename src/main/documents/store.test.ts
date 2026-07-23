import { mkdtemp, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { describe, expect, it } from "vitest";

import { createLocalDocumentStore } from "./store";

async function tempRoot(): Promise<string> {
  return mkdtemp(join(tmpdir(), "uix-doc-store-"));
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

  it("creates immutable versions from current bytes and opaque metadata", async () => {
    const root = await tempRoot();
    const store = createLocalDocumentStore(root, { namespace: "canvas" });

    await store.setCurrent("main", "first");
    const first = await store.createSnapshot("main", { anchors: ["a"] });
    await store.setCurrent("main", "second");
    const loaded = await store.getVersion("main", first.id);

    expect(loaded).toEqual(first);
    expect(loaded).toMatchObject({
      documentId: "main",
      content: "first",
      meta: { anchors: ["a"] },
    });
    expect(await store.getCurrent("main")).toBe("second");
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
