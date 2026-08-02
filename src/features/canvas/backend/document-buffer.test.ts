import { describe, expect, it, vi } from "vitest";

import { AnchoredDocument } from "./anchors/document";

import { CanvasDocumentBuffer } from "./document-buffer";
import type { DocumentStore, DocumentVersion } from "@uix/api/documents";

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
    createSnapshot(docId, meta) {
      const version: DocumentVersion<typeof meta> = {
        id: `v${String(versions.size + 1)}`,
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

  it("serializes concurrent first operations over one document", async () => {
    const backing = memoryStore();
    let releaseFirstRead: (() => void) | undefined;
    let firstRead = true;
    const getCurrent = vi.fn((docId: string) => {
      if (!firstRead) return backing.getCurrent(docId);
      firstRead = false;
      return new Promise<string | null>((resolve) => {
        releaseFirstRead = () => { resolve(null); };
      });
    });
    const store: DocumentStore = { ...backing, getCurrent };
    const buffer = new CanvasDocumentBuffer(store);

    const first = buffer.write("main", "<body><p>first</p></body>");
    await Promise.resolve();
    const second = buffer.write("main", "<body><p>second</p></body>");
    await Promise.resolve();

    expect(getCurrent).toHaveBeenCalledOnce();
    releaseFirstRead?.();
    await Promise.all([first, second]);
    expect(backing.dump("main")).toContain("<p>second</p>");
  });

  it("edits only the target range and preserves untouched anchors", async () => {
    const store = memoryStore();
    const buffer = new CanvasDocumentBuffer(store);
    const lines = await buffer.write(
      "main",
      "<body>\n<p>a</p>\n<p>b</p>\n</body>",
    );
    const target = lines.find((line) => line.text === "<p>a</p>");
    if (!target) throw new Error("missing <p>a</p> line");

    const changes = await buffer.edit("main", {
      start: target,
      end: target,
      replacement: "<p>A</p>",
    });

    expect(changes.flatMap((c) => c.newLines).map((l) => l.text)).toContain(
      "<p>A</p>",
    );
    const read = await buffer.read("main");
    const before = lines.find((line) => line.text === "<p>b</p>");
    const after = read.find((line) => line.text === "<p>b</p>");
    if (!before || !after) throw new Error("missing <p>b</p> line");
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
    const closingSelect = lines.find((line) => line.text === "</select>");
    if (!closingSelect) throw new Error("missing </select> line");

    const changes = await buffer.edit("main", {
      start: closingSelect,
      end: closingSelect,
      replacement: '<option value="rainbow">🌈 rainbow</option>\n</select>',
    });

    expect(changes.flatMap((c) => c.newLines).map((l) => l.text)).toContain(
      '<option value="rainbow">🌈 rainbow</option>',
    );
    const read = await buffer.read("main");
    const restoredClosing = read.find((line) => line.text === "</select>");
    if (!restoredClosing) throw new Error("missing </select> line");
    expect(restoredClosing.anchor).toBe(closingSelect.anchor);
    expect(store.dump("main")).toContain(
      '<option value="rainbow">🌈 rainbow</option>\n</select>',
    );
  });

  it("rejects an edit whose boundary no longer matches", async () => {
    const buffer = new CanvasDocumentBuffer(memoryStore());
    const lines = await buffer.write("main", "<body>\n<p>a</p>\n</body>");
    const target = lines.find((line) => line.text === "<p>a</p>");
    if (!target) throw new Error("missing <p>a</p> line");

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
    const aLine = lines.find((l) => l.text === "<p>a</p>");
    if (!aLine) throw new Error("missing <p>a</p> line");
    const aAnchor = aLine.anchor;

    const writeback = store.dump("main");
    if (!writeback) throw new Error("missing main");
    await buffer.writeback("main", writeback.replace("<p>b</p>", "<p>B</p>"));

    const read = await buffer.read("main");
    const restoredA = read.find((l) => l.text === "<p>a</p>");
    if (!restoredA) throw new Error("missing <p>a</p> line");
    expect(restoredA.anchor).toBe(aAnchor);
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
    const a = lines.find((l) => l.text === "<p>a</p>");
    if (!a) throw new Error("missing <p>a</p> line");

    // Human changes c out of band; agent then edits a against its stale view.
    const outOfBand = store.dump("main");
    if (!outOfBand) throw new Error("missing main");
    await store.setCurrent("main", outOfBand.replace("<p>c</p>", "<p>C</p>"));
    await buffer.edit("main", { start: a, end: a, replacement: "<p>A</p>" });

    const current = store.dump("main");
    if (!current) throw new Error("missing main");
    expect(current).toContain("<p>A</p>"); // agent's edit applied
    expect(current).toContain("<p>C</p>"); // human's edit survived
    expect(current).not.toContain("<p>c</p>");
  });

  it("absorbs a purely cosmetic out-of-band rewrite", async () => {
    const store = memoryStore();
    const buffer = new CanvasDocumentBuffer(store);
    const before = await buffer.write("main", "<body>\n<p>x</p>\n</body>");

    // Same content, non-canonical casing — canonicalization absorbs it.
    const rewritten = store.dump("main");
    if (!rewritten) throw new Error("missing main");
    await store.setCurrent("main", rewritten.replace("<p>x</p>", "<P>x</P>"));

    await expect(buffer.read("main")).resolves.toEqual(before);
  });

  it("creates content snapshots with restorable anchor state", async () => {
    const store = memoryStore();
    const buffer = new CanvasDocumentBuffer(store);
    const lines = await buffer.write("main", "<body>\n<p>a</p>\n</body>");

    const snapshots = await buffer.createSnapshots(["main"]);
    const version = snapshots.get("main");
    if (!version) throw new Error("missing snapshot");

    expect(version.content).toBe(store.dump("main"));
    expect(version.meta.anchors.lines).toEqual(lines);
    const restored = new AnchoredDocument(version.meta.anchors);
    expect(restored.read()).toEqual(lines);
  });

  it("diffs two snapshot versions using their persisted anchor state", async () => {
    const store = memoryStore();
    const buffer = new CanvasDocumentBuffer(store);
    const initial = await buffer.write(
      "main",
      "<body>\n<p>a</p>\n<p>b</p>\n</body>",
    );
    const before = (await buffer.createSnapshots(["main"])).get("main");
    if (!before) throw new Error("missing before snapshot");

    const beforeWrite = store.dump("main");
    if (!beforeWrite) throw new Error("missing main");
    await buffer.writeback("main", beforeWrite.replace("<p>b</p>", "<p>B</p>"));
    const after = (await buffer.createSnapshots(["main"])).get("main");
    if (!after) throw new Error("missing after snapshot");

    const oldB = initial.find((line) => line.text === "<p>b</p>");
    const newB = after.meta.anchors.lines.find(
      (line) => line.text === "<p>B</p>",
    );
    if (!oldB || !newB) throw new Error("missing line");

    await expect(
      buffer.diffVersions("main", before.id, after.id),
    ).resolves.toEqual([
      {
        oldLines: [oldB],
        newLines: [newB],
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
