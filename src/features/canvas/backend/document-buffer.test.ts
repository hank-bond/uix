import { describe, expect, it } from "vitest";

import { AnchoredDocument } from "#backend/anchors/document";

import { CanvasDocumentBuffer } from "./document-buffer";
import type { DocumentStore, DocumentVersion } from "#backend/documents/store";

// In-memory store standing in for the file-backed one, plus a dump() peek so
// tests can assert current content.
function memoryStore(
  initial: Record<string, string> = {},
): DocumentStore & { dump(docId: string): string | null } {
  const map = new Map<string, string>(Object.entries(initial));
  const versions = new Map<string, DocumentVersion>();
  return {
    getCurrent(docId) {
      return Promise.resolve(map.get(docId) ?? null);
    },
    setCurrent(docId, content) {
      map.set(docId, content);
      return Promise.resolve();
    },
    snapshotCurrent(docId, meta) {
      const version: DocumentVersion<typeof meta> = {
        id: `v${versions.size + 1}`,
        documentId: docId,
        content: map.get(docId) ?? "",
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
    dump(docId) {
      return map.get(docId) ?? null;
    },
  };
}

describe("CanvasDocumentBuffer", () => {
  it("writes canonical content and returns anchored lines", async () => {
    const store = memoryStore();
    const buffer = new CanvasDocumentBuffer(store);

    const lines = await buffer.write("main", "<body>\n<P>hi</P>\n</body>");

    expect(lines.some((line) => line.text === "<p>hi</p>")).toBe(true);
    expect(lines.every((line) => line.anchor.length > 0)).toBe(true);
    // Current content is plain canonical HTML — no anchors leak to the store.
    expect(store.dump("main")).toContain("<p>hi</p>");
    expect(store.dump("main")).not.toContain("§");
  });

  it("reads back exactly what it wrote", async () => {
    const buffer = new CanvasDocumentBuffer(memoryStore());

    const written = await buffer.write(
      "main",
      "<body>\n<p>a</p>\n<p>b</p>\n</body>",
    );
    const read = await buffer.read("main");

    expect(read).toEqual(written);
  });

  it("edits only the target range and preserves untouched anchors", async () => {
    const store = memoryStore();
    const buffer = new CanvasDocumentBuffer(store);
    const lines = await buffer.write(
      "main",
      "<body>\n<p>a</p>\n<p>b</p>\n</body>",
    );
    const target = lines.find((line) => line.text === "<p>a</p>")!;

    const changes = await buffer.edit("main", {
      start: target,
      end: target,
      replacement: "<p>A</p>",
    });

    expect(changes.flatMap((c) => c.newLines).map((l) => l.text)).toContain(
      "<p>A</p>",
    );
    const read = await buffer.read("main");
    const before = lines.find((line) => line.text === "<p>b</p>")!;
    const after = read.find((line) => line.text === "<p>b</p>")!;
    expect(after.anchor).toBe(before.anchor);
    expect(store.dump("main")).toContain("<p>A</p>");
  });

  it("keeps a retained closing tag when the edit replacement is only valid in document context", async () => {
    const store = memoryStore();
    const buffer = new CanvasDocumentBuffer(store);
    const lines = await buffer.write(
      "main",
      [
        "<!doctype html>",
        "<html>",
        "<body>",
        '<select id="wordA">',
        '<option value="bunny">🐰 bunny</option>',
        "</select>",
        "</body>",
        "</html>",
      ].join("\n"),
    );
    const closingSelect = lines.find((line) => line.text === "</select>")!;

    const changes = await buffer.edit("main", {
      start: closingSelect,
      end: closingSelect,
      replacement: '<option value="rainbow">🌈 rainbow</option>\n</select>',
    });

    expect(changes.flatMap((c) => c.newLines).map((l) => l.text)).toContain(
      '<option value="rainbow">🌈 rainbow</option>',
    );
    const read = await buffer.read("main");
    expect(read.find((line) => line.text === "</select>")!.anchor).toBe(
      closingSelect.anchor,
    );
    expect(store.dump("main")).toContain(
      '<option value="rainbow">🌈 rainbow</option>\n</select>',
    );
  });

  it("rejects an edit whose boundary no longer matches", async () => {
    const buffer = new CanvasDocumentBuffer(memoryStore());
    const lines = await buffer.write("main", "<body>\n<p>a</p>\n</body>");
    const target = lines.find((line) => line.text === "<p>a</p>")!;

    await expect(
      buffer.edit("main", {
        start: { anchor: target.anchor, text: "<p>stale</p>" },
        end: { anchor: target.anchor, text: "<p>stale</p>" },
        replacement: "<p>A</p>",
      }),
    ).rejects.toThrow(/mismatch/);
  });

  it("loads existing store content canonically on first touch", async () => {
    const buffer = new CanvasDocumentBuffer(
      memoryStore({ main: "<body><DIV>x</DIV></body>" }),
    );

    const read = await buffer.read("main");

    expect(read.some((line) => line.text.includes("<div>x</div>"))).toBe(true);
  });

  it("reconciles a pane writeback, preserving untouched anchors", async () => {
    const store = memoryStore();
    const buffer = new CanvasDocumentBuffer(store);
    const lines = await buffer.write(
      "main",
      "<body>\n<p>a</p>\n<p>b</p>\n<p>c</p>\n</body>",
    );
    const aAnchor = lines.find((l) => l.text === "<p>a</p>")!.anchor;

    await buffer.writeback(
      "main",
      store.dump("main")!.replace("<p>b</p>", "<p>B</p>"),
    );

    const read = await buffer.read("main");
    expect(read.find((l) => l.text === "<p>a</p>")!.anchor).toBe(aAnchor);
    expect(read.map((l) => l.text)).toContain("<p>B</p>");
    expect(store.dump("main")).toContain("<p>B</p>");
  });

  it("an agent edit does not clobber a concurrent human edit to another line", async () => {
    const store = memoryStore();
    const buffer = new CanvasDocumentBuffer(store);
    const lines = await buffer.write(
      "main",
      "<body>\n<p>a</p>\n<p>b</p>\n<p>c</p>\n</body>",
    );
    const a = lines.find((l) => l.text === "<p>a</p>")!;

    // Human changes c out of band; agent then edits a against its stale view.
    await store.setCurrent(
      "main",
      store.dump("main")!.replace("<p>c</p>", "<p>C</p>"),
    );
    await buffer.edit("main", { start: a, end: a, replacement: "<p>A</p>" });

    const current = store.dump("main")!;
    expect(current).toContain("<p>A</p>"); // agent's edit applied
    expect(current).toContain("<p>C</p>"); // human's edit survived
    expect(current).not.toContain("<p>c</p>");
  });

  it("absorbs a purely cosmetic out-of-band rewrite", async () => {
    const store = memoryStore();
    const buffer = new CanvasDocumentBuffer(store);
    const before = await buffer.write("main", "<body>\n<p>x</p>\n</body>");

    // Same content, non-canonical casing — canonicalization absorbs it.
    await store.setCurrent(
      "main",
      store.dump("main")!.replace("<p>x</p>", "<P>x</P>"),
    );

    await expect(buffer.read("main")).resolves.toEqual(before);
  });

  it("snapshots current content with restorable anchor state", async () => {
    const store = memoryStore();
    const buffer = new CanvasDocumentBuffer(store);
    const lines = await buffer.write("main", "<body>\n<p>a</p>\n</body>");

    const snapshots = await buffer.snapshotCurrent(["main"]);
    const version = snapshots.get("main")!;

    expect(version.content).toBe(store.dump("main"));
    expect(version.meta.anchors.lines).toEqual(lines);
    const restored = new AnchoredDocument(version.meta.anchors);
    expect(restored.read()).toEqual(lines);
  });

  it("diffs two snapshotted versions using their persisted anchor state", async () => {
    const store = memoryStore();
    const buffer = new CanvasDocumentBuffer(store);
    const initial = await buffer.write(
      "main",
      "<body>\n<p>a</p>\n<p>b</p>\n</body>",
    );
    const before = (await buffer.snapshotCurrent(["main"])).get("main")!;

    await buffer.writeback(
      "main",
      store.dump("main")!.replace("<p>b</p>", "<p>B</p>"),
    );
    const after = (await buffer.snapshotCurrent(["main"])).get("main")!;

    await expect(
      buffer.diffVersions("main", before.id, after.id),
    ).resolves.toEqual([
      {
        oldLines: [initial.find((line) => line.text === "<p>b</p>")!],
        newLines: [
          after.meta.anchors.lines.find((line) => line.text === "<p>B</p>")!,
        ],
      },
    ]);
  });

  it("throws when diffing an unknown canvas version", async () => {
    const buffer = new CanvasDocumentBuffer(memoryStore());

    await expect(
      buffer.diffVersions("main", "missing-a", "missing-b"),
    ).rejects.toThrow("Canvas document version not found: main@missing-a");
  });
});
