import { mkdtemp, rm, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  listRecentSessionFiles,
  resolveSessionFileById,
} from "./session-files";

const dirs: string[] = [];

afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true })));
});

describe("listRecentSessionFiles", () => {
  it("selects JSONL files newest-first before applying the limit", async () => {
    const dir = await mkdtemp(join(tmpdir(), "uix-session-files-"));
    dirs.push(dir);
    const oldest = join(dir, "oldest.jsonl");
    const middle = join(dir, "middle.jsonl");
    const newest = join(dir, "newest.jsonl");
    await Promise.all([
      writeFile(oldest, ""),
      writeFile(middle, ""),
      writeFile(newest, ""),
      writeFile(join(dir, "notes.txt"), ""),
    ]);
    await Promise.all([
      utimes(oldest, new Date(1_000), new Date(1_000)),
      utimes(middle, new Date(2_000), new Date(2_000)),
      utimes(newest, new Date(3_000), new Date(3_000)),
    ]);

    await expect(listRecentSessionFiles(dir, 2)).resolves.toEqual([
      { path: newest, modifiedAt: new Date(3_000) },
      { path: middle, modifiedAt: new Date(2_000) },
    ]);
  });

  it("returns no files when the session directory does not exist", async () => {
    const dir = await mkdtemp(join(tmpdir(), "uix-session-files-"));
    dirs.push(dir);
    await expect(
      listRecentSessionFiles(join(dir, "missing"), 10),
    ).resolves.toEqual([]);
  });
});

describe("resolveSessionFileById", () => {
  it("resolves only the exact durable id suffix", async () => {
    const dir = await mkdtemp(join(tmpdir(), "uix-session-files-"));
    dirs.push(dir);
    const target = join(dir, "2026-07-19_session-1.jsonl");
    await Promise.all([
      writeFile(target, ""),
      writeFile(join(dir, "2026-07-19_other-session-1.jsonl"), ""),
      writeFile(join(dir, "notes.txt"), ""),
    ]);

    await expect(resolveSessionFileById(dir, "session-1")).resolves.toBe(
      target,
    );
    await expect(
      resolveSessionFileById(dir, "missing"),
    ).resolves.toBeUndefined();
  });
});
