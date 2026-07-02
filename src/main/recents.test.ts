import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { createRecentsStore } from "./recents";

async function setup() {
  const dir = await mkdtemp(join(tmpdir(), "uix-recents-test-"));
  const manifest = async (name: string) => {
    const p = join(dir, `${name}.uix.workspace.json`);
    await writeFile(p, "{}");
    return p;
  };
  return { store: createRecentsStore(join(dir, "recents.json")), manifest };
}

describe("recents store", () => {
  it("starts empty and records newest first", async () => {
    const { store, manifest } = await setup();
    expect(store.list()).toEqual([]);

    const a = await manifest("a");
    const b = await manifest("b");
    store.record({ manifestPath: a, name: "A" });
    store.record({ manifestPath: b, name: "B" });

    expect(store.list().map((e) => e.name)).toEqual(["B", "A"]);
  });

  it("upserts by manifest path, moving the entry to the front", async () => {
    const { store, manifest } = await setup();
    const a = await manifest("a");
    const b = await manifest("b");
    store.record({ manifestPath: a, name: "A" });
    store.record({ manifestPath: b, name: "B" });
    store.record({ manifestPath: a, name: "A renamed" });

    const names = store.list().map((e) => e.name);
    expect(names).toEqual(["A renamed", "B"]);
  });

  it("prunes entries whose manifest no longer exists", async () => {
    const { store, manifest } = await setup();
    const a = await manifest("a");
    store.record({ manifestPath: a, name: "A" });
    store.record({ manifestPath: join(tmpdir(), "gone.json"), name: "Gone" });

    expect(store.list().map((e) => e.name)).toEqual(["A"]);
  });

  it("caps the list at ten entries", async () => {
    const { store, manifest } = await setup();
    for (let i = 0; i < 12; i++) {
      store.record({ manifestPath: await manifest(`w${i}`), name: `W${i}` });
    }
    const names = store.list().map((e) => e.name);
    expect(names).toHaveLength(10);
    expect(names[0]).toBe("W11");
    expect(names.at(-1)).toBe("W2");
  });
});
