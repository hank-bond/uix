import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { SessionManager } from "@earendil-works/pi-coding-agent";
import { afterEach, describe, expect, it, vi } from "vitest";

import { openExistingSessionManager } from "./session-manager";

const sdk = vi.hoisted(() => ({
  manager: {} as SessionManager,
  open: vi.fn(),
}));

vi.mock("@earendil-works/pi-coding-agent", () => ({
  SessionManager: { open: sdk.open },
}));

const roots: string[] = [];

afterEach(async () => {
  sdk.open.mockReset();
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

async function createSessionFile(sessionId: string): Promise<{
  sessionDir: string;
  sessionFile: string;
}> {
  const root = await mkdtemp(join(tmpdir(), "target-manager-"));
  roots.push(root);
  const sessionDir = join(root, "sessions");
  const sessionFile = join(
    sessionDir,
    `2026-08-12T01-00-00-000Z_${sessionId}.jsonl`,
  );
  await mkdir(sessionDir, { recursive: true });
  await writeFile(sessionFile, "");
  return { sessionDir, sessionFile };
}

describe("openExistingSessionManager", () => {
  it("opens a fresh manager for the explicit session target", async () => {
    const target = await createSessionFile("session-a");
    sdk.open.mockReturnValue(sdk.manager);

    await expect(
      openExistingSessionManager(target.sessionDir, "session-a"),
    ).resolves.toBe(sdk.manager);
    expect(sdk.open).toHaveBeenCalledWith(
      target.sessionFile,
      target.sessionDir,
    );
  });

  it("returns undefined without opening a manager when the target is missing", async () => {
    const { sessionDir } = await createSessionFile("session-a");

    await expect(
      openExistingSessionManager(sessionDir, "missing"),
    ).resolves.toBeUndefined();
    expect(sdk.open).not.toHaveBeenCalled();
  });
});
