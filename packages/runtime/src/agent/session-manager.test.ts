import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { SessionManager } from "@earendil-works/pi-coding-agent";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  openExistingSessionManager,
  openWorkspaceFallbackSession,
} from "./session-manager";

const sdk = vi.hoisted(() => {
  const manager = (sessionId: string): SessionManager =>
    ({ getSessionId: () => sessionId }) as SessionManager;
  return {
    manager,
    open: vi.fn(),
    continueRecent: vi.fn(),
    create: vi.fn(),
  };
});

vi.mock("@earendil-works/pi-coding-agent", () => ({
  SessionManager: {
    open: sdk.open,
    continueRecent: sdk.continueRecent,
    create: sdk.create,
  },
}));

const roots: string[] = [];

afterEach(async () => {
  sdk.open.mockReset();
  sdk.continueRecent.mockReset();
  sdk.create.mockReset();
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
    const manager = sdk.manager("session-a");
    sdk.open.mockReturnValue(manager);

    await expect(
      openExistingSessionManager(target.sessionDir, "session-a"),
    ).resolves.toBe(manager);
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

describe("openWorkspaceFallbackSession", () => {
  it("continues the most recent session", async () => {
    const { sessionDir } = await createSessionFile("other");
    const manager = sdk.manager("recent");
    sdk.continueRecent.mockReturnValue(manager);

    await expect(
      openWorkspaceFallbackSession({
        cwd: "/workspace",
        sessionDir,
      }),
    ).resolves.toEqual({
      target: { sessionId: "recent" },
      manager,
    });
    expect(sdk.continueRecent).toHaveBeenCalledWith("/workspace", sessionDir);
  });

  it("creates a session when recent-session recovery fails", async () => {
    const { sessionDir } = await createSessionFile("other");
    const manager = sdk.manager("new");
    sdk.continueRecent.mockImplementation(() => {
      throw new Error("none");
    });
    sdk.create.mockReturnValue(manager);

    await expect(
      openWorkspaceFallbackSession({ cwd: "/workspace", sessionDir }),
    ).resolves.toEqual({
      target: { sessionId: "new" },
      manager,
    });
    expect(sdk.create).toHaveBeenCalledWith("/workspace", sessionDir);
  });
});
