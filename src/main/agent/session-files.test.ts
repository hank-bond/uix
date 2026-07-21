import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { resolveSessionFileById } from "./session-files";

const dirs: string[] = [];

afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true })));
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
