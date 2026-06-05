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
});
