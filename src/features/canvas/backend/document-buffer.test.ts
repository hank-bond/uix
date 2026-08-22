import { describe, expect, it } from "vitest";

import type { DocumentStore, DocumentVersion } from "@uix/api/documents";

import { AnchoredDocument } from "./anchors/document";
import { CanvasDocumentBuffer } from "./document-buffer";

function memoryStore(): DocumentStore {
  const versions = new Map<string, DocumentVersion>();
  return {
    getCurrent: () => Promise.resolve(null),
    setCurrent: () => Promise.resolve(),
    createSnapshot<TMeta>(docId: string, content: string, meta: TMeta) {
      const version: DocumentVersion<TMeta> = {
        id: `v${String(versions.size + 1)}`,
        documentId: docId,
        content,
        meta,
        createdAt: new Date(0).toISOString(),
      };
      versions.set(`${docId}:${version.id}`, version);
      return Promise.resolve(version);
    },
    getVersion<TMeta>(docId: string, versionId: string) {
      return Promise.resolve(
        (versions.get(`${docId}:${versionId}`) as
          | DocumentVersion<TMeta>
          | undefined) ?? null,
      );
    },
  };
}

describe("CanvasDocumentBuffer", () => {
  it("writes canonical content and returns anchored lines", async () => {
    const buffer = new CanvasDocumentBuffer(memoryStore());

    const lines = await buffer.write("main", "<body>\n<P>hi</P>\n</body>");

    expect(lines.some((line) => line.text === "<p>hi</p>")).toBe(true);
    expect(lines.every((line) => line.anchor.length > 0)).toBe(true);
    expect(await buffer.readHtml("main")).toContain("<p>hi</p>");
    expect(await buffer.readHtml("main")).not.toContain("§");
  });

  it("keeps separate working state for buffers over one store", async () => {
    const store = memoryStore();
    const first = new CanvasDocumentBuffer(store);
    const second = new CanvasDocumentBuffer(store);

    await first.write("main", "<p>first</p>");
    await second.write("main", "<p>second</p>");

    expect(await first.readHtml("main")).toContain("first");
    expect(await second.readHtml("main")).toContain("second");
  });

  it("edits one range and preserves untouched anchors", async () => {
    const buffer = new CanvasDocumentBuffer(memoryStore());
    const lines = await buffer.write(
      "main",
      "<body>\n<p>a</p>\n<p>b</p>\n</body>",
    );
    const target = lines.find((line) => line.text === "<p>a</p>");
    const untouched = lines.find((line) => line.text === "<p>b</p>");
    if (!target || !untouched) throw new Error("missing test lines");

    await buffer.edit("main", {
      start: target,
      end: target,
      replacement: "<p>A</p>",
    });

    const read = await buffer.read("main");
    expect(read.find((line) => line.text === "<p>b</p>")?.anchor).toBe(
      untouched.anchor,
    );
  });

  it("rejects an edit whose boundary no longer matches", async () => {
    const buffer = new CanvasDocumentBuffer(memoryStore());
    const lines = await buffer.write("main", "<body>\n<p>a</p>\n</body>");
    const target = lines.find((line) => line.text === "<p>a</p>");
    if (!target) throw new Error("missing test line");

    await expect(
      buffer.edit("main", {
        start: { anchor: target.anchor, text: "<p>stale</p>" },
        end: { anchor: target.anchor, text: "<p>stale</p>" },
        replacement: "<p>A</p>",
      }),
    ).rejects.toThrow(/mismatch/);
  });

  it("reconciles human writeback while preserving untouched anchors", async () => {
    const buffer = new CanvasDocumentBuffer(memoryStore());
    const lines = await buffer.write(
      "main",
      "<body>\n<p>a</p>\n<p>b</p>\n</body>",
    );
    const a = lines.find((line) => line.text === "<p>a</p>");
    if (!a) throw new Error("missing test line");

    await buffer.writeback(
      "main",
      (await buffer.readHtml("main")).replace("<p>b</p>", "<p>B</p>"),
    );

    expect(
      (await buffer.read("main")).find((line) => line.text === "<p>a</p>"),
    ).toMatchObject({ anchor: a.anchor });
  });

  it("creates immutable versions with restorable anchor state", async () => {
    const store = memoryStore();
    const buffer = new CanvasDocumentBuffer(store);
    const lines = await buffer.write("main", "<body>\n<p>a</p>\n</body>");

    const version = (await buffer.createSnapshots(["main"])).get("main");
    if (!version) throw new Error("missing snapshot");

    expect(version.content).toBe(await buffer.readHtml("main"));
    expect(version.meta.anchors.lines).toEqual(lines);
    expect(new AnchoredDocument(version.meta.anchors).read()).toEqual(lines);
  });

  it("restores one buffer without changing another", async () => {
    const store = memoryStore();
    const source = new CanvasDocumentBuffer(store);
    await source.write("main", "<p>saved</p>");
    const version = (await source.createSnapshots(["main"])).get("main");
    if (!version) throw new Error("missing snapshot");

    const first = new CanvasDocumentBuffer(store);
    const second = new CanvasDocumentBuffer(store);
    await second.write("main", "<p>other</p>");
    await first.restoreVersions(new Map([["main", version.id]]));

    expect(await first.readHtml("main")).toContain("saved");
    expect(await second.readHtml("main")).toContain("other");
  });

  it("diffs persisted versions by anchor state", async () => {
    const store = memoryStore();
    const buffer = new CanvasDocumentBuffer(store);
    const initial = await buffer.write(
      "main",
      "<body>\n<p>a</p>\n<p>b</p>\n</body>",
    );
    const before = (await buffer.createSnapshots(["main"])).get("main");
    if (!before) throw new Error("missing before snapshot");
    await buffer.writeback(
      "main",
      (await buffer.readHtml("main")).replace("<p>b</p>", "<p>B</p>"),
    );
    const after = (await buffer.createSnapshots(["main"])).get("main");
    if (!after) throw new Error("missing after snapshot");

    await expect(
      buffer.diffVersions("main", before.id, after.id),
    ).resolves.toEqual([
      {
        oldLines: [initial.find((line) => line.text === "<p>b</p>")],
        newLines: [
          after.meta.anchors.lines.find((line) => line.text === "<p>B</p>"),
        ],
      },
    ]);
  });
});
