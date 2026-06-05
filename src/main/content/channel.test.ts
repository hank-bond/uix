import { describe, expect, it } from "vitest";

import { DocumentChannel } from "./channel";
import type { ContentStore } from "./content-store";

// In-memory store standing in for the file-backed one, plus a dump() peek so
// tests can assert what was committed.
function memoryStore(
  initial: Record<string, string> = {},
): ContentStore & { dump(docId: string): string | null } {
  const map = new Map<string, string>(Object.entries(initial));
  return {
    getCurrent(docId) {
      return Promise.resolve(map.get(docId) ?? null);
    },
    commit(docId, content) {
      map.set(docId, content);
      return Promise.resolve();
    },
    dump(docId) {
      return map.get(docId) ?? null;
    },
  };
}

describe("DocumentChannel", () => {
  it("writes canonical content and returns anchored lines", async () => {
    const store = memoryStore();
    const channel = new DocumentChannel(store);

    const lines = await channel.write("main", "<body>\n<P>hi</P>\n</body>");

    expect(lines.some((line) => line.text === "<p>hi</p>")).toBe(true);
    expect(lines.every((line) => line.anchor.length > 0)).toBe(true);
    // Committed content is plain canonical HTML — no anchors leak to the store.
    expect(store.dump("main")).toContain("<p>hi</p>");
    expect(store.dump("main")).not.toContain("§");
  });

  it("reads back exactly what it wrote", async () => {
    const channel = new DocumentChannel(memoryStore());

    const written = await channel.write(
      "main",
      "<body>\n<p>a</p>\n<p>b</p>\n</body>",
    );
    const read = await channel.read("main");

    expect(read).toEqual(written);
  });

  it("edits only the target range and preserves untouched anchors", async () => {
    const store = memoryStore();
    const channel = new DocumentChannel(store);
    const lines = await channel.write(
      "main",
      "<body>\n<p>a</p>\n<p>b</p>\n</body>",
    );
    const target = lines.find((line) => line.text === "<p>a</p>")!;

    const changes = await channel.edit("main", {
      start: target,
      end: target,
      replacement: "<p>A</p>",
    });

    expect(changes.flatMap((c) => c.newLines).map((l) => l.text)).toContain(
      "<p>A</p>",
    );
    const read = await channel.read("main");
    const before = lines.find((line) => line.text === "<p>b</p>")!;
    const after = read.find((line) => line.text === "<p>b</p>")!;
    expect(after.anchor).toBe(before.anchor);
    expect(store.dump("main")).toContain("<p>A</p>");
  });

  it("rejects an edit whose boundary no longer matches", async () => {
    const channel = new DocumentChannel(memoryStore());
    const lines = await channel.write("main", "<body>\n<p>a</p>\n</body>");
    const target = lines.find((line) => line.text === "<p>a</p>")!;

    await expect(
      channel.edit("main", {
        start: { anchor: target.anchor, text: "<p>stale</p>" },
        end: { anchor: target.anchor, text: "<p>stale</p>" },
        replacement: "<p>A</p>",
      }),
    ).rejects.toThrow(/mismatch/);
  });

  it("loads existing store content canonically on first touch", async () => {
    const channel = new DocumentChannel(
      memoryStore({ main: "<body><DIV>x</DIV></body>" }),
    );

    const read = await channel.read("main");

    expect(read.some((line) => line.text.includes("<div>x</div>"))).toBe(true);
  });

  it("reports an out-of-band (human) edit as changes, preserving untouched anchors", async () => {
    const store = memoryStore();
    const channel = new DocumentChannel(store);
    const lines = await channel.write(
      "main",
      "<body>\n<p>a</p>\n<p>b</p>\n<p>c</p>\n</body>",
    );
    const aAnchor = lines.find((l) => l.text === "<p>a</p>")!.anchor;

    // A human edits line b directly in the store (raw HTML, same whitespace).
    await store.commit(
      "main",
      store.dump("main")!.replace("<p>b</p>", "<p>B</p>"),
    );

    const changes = await channel.collectChanges();
    const hunks = changes.get("main")!;
    expect(hunks.flatMap((h) => h.oldLines).map((l) => l.text)).toContain(
      "<p>b</p>",
    );
    expect(hunks.flatMap((h) => h.newLines).map((l) => l.text)).toContain(
      "<p>B</p>",
    );
    // Untouched line keeps its anchor across the reconcile.
    const read = await channel.read("main");
    expect(read.find((l) => l.text === "<p>a</p>")!.anchor).toBe(aAnchor);
  });

  it("collectChanges is idempotent once synced", async () => {
    const store = memoryStore();
    const channel = new DocumentChannel(store);
    await channel.write("main", "<body>\n<p>a</p>\n</body>");
    await store.commit(
      "main",
      store.dump("main")!.replace("<p>a</p>", "<p>A</p>"),
    );

    expect((await channel.collectChanges()).size).toBe(1);
    expect((await channel.collectChanges()).size).toBe(0);
  });

  it("an agent edit does not clobber a concurrent human edit to another line", async () => {
    const store = memoryStore();
    const channel = new DocumentChannel(store);
    const lines = await channel.write(
      "main",
      "<body>\n<p>a</p>\n<p>b</p>\n<p>c</p>\n</body>",
    );
    const a = lines.find((l) => l.text === "<p>a</p>")!;

    // Human changes c out of band; agent then edits a against its stale view.
    await store.commit(
      "main",
      store.dump("main")!.replace("<p>c</p>", "<p>C</p>"),
    );
    await channel.edit("main", { start: a, end: a, replacement: "<p>A</p>" });

    const committed = store.dump("main")!;
    expect(committed).toContain("<p>A</p>"); // agent's edit applied
    expect(committed).toContain("<p>C</p>"); // human's edit survived
    expect(committed).not.toContain("<p>c</p>");
  });

  it("ignores a purely cosmetic out-of-band rewrite", async () => {
    const store = memoryStore();
    const channel = new DocumentChannel(store);
    await channel.write("main", "<body>\n<p>x</p>\n</body>");

    // Same content, non-canonical casing — canonicalization absorbs it.
    await store.commit(
      "main",
      store.dump("main")!.replace("<p>x</p>", "<P>x</P>"),
    );

    expect((await channel.collectChanges()).size).toBe(0);
  });
});
