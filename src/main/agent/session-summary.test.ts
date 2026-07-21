import { mkdtemp, rm, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import type { SessionManager } from "@earendil-works/pi-coding-agent";

import {
  readRecentSessionSummaries,
  readSessionFileSummary,
  readSessionSummary,
} from "./session-summary";

const dirs: string[] = [];

afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true })));
});

function fakeManager(options: {
  displayName?: string;
  entries?: unknown[];
}): SessionManager {
  return {
    getHeader: () => ({ timestamp: "2026-07-19T10:00:00.000Z" }),
    getSessionId: () => "session-1",
    getSessionFile: () => undefined,
    getSessionName: () => options.displayName,
    getEntries: () => options.entries ?? [],
  } as unknown as SessionManager;
}

function userMessage(text: string) {
  return {
    type: "message",
    message: { role: "user", content: text },
  };
}

describe("readRecentSessionSummaries", () => {
  it("returns the bounded recent projection in mtime order", async () => {
    const dir = await mkdtemp(join(tmpdir(), "uix-session-summary-"));
    dirs.push(dir);
    const newestPath = join(dir, "newest.jsonl");
    const middlePath = join(dir, "middle.jsonl");
    const excludedPath = join(dir, "excluded.jsonl");
    const sessionJsonl = (id: string, label: string) =>
      [
        JSON.stringify({
          type: "session",
          version: 3,
          id,
          timestamp: "2026-07-19T10:00:00.000Z",
          cwd: "/tmp/ws",
        }),
        JSON.stringify({
          type: "message",
          message: { role: "user", content: label },
        }),
      ].join("\n");
    await Promise.all([
      writeFile(newestPath, sessionJsonl("session-1", "newest")),
      writeFile(middlePath, sessionJsonl("session-2", "middle")),
      writeFile(excludedPath, sessionJsonl("session-3", "excluded")),
    ]);
    await Promise.all([
      utimes(newestPath, new Date(3_000), new Date(3_000)),
      utimes(middlePath, new Date(2_000), new Date(2_000)),
      utimes(excludedPath, new Date(1_000), new Date(1_000)),
    ]);

    const summaries = await readRecentSessionSummaries(dir, 2);

    expect(
      summaries.map(({ sessionId, displayLabel }) => ({
        sessionId,
        displayLabel,
      })),
    ).toEqual([
      { sessionId: "session-1", displayLabel: "newest" },
      { sessionId: "session-2", displayLabel: "middle" },
    ]);
  });
});

describe("readSessionFileSummary", () => {
  it("reads the header, first user message, and latest explicit name", async () => {
    const dir = await mkdtemp(join(tmpdir(), "uix-session-summary-"));
    dirs.push(dir);
    const path = join(dir, "session.jsonl");
    await writeFile(
      path,
      [
        {
          type: "session",
          version: 3,
          id: "session-1",
          timestamp: "2026-07-19T10:00:00.000Z",
          cwd: "/tmp/ws",
        },
        {
          type: "message",
          id: "assistant-1",
          parentId: null,
          timestamp: "2026-07-19T10:01:00.000Z",
          message: { role: "assistant", content: "mentions user" },
        },
        {
          type: "message",
          id: "user-1",
          parentId: "assistant-1",
          timestamp: "2026-07-19T10:02:00.000Z",
          message: { role: "user", content: "  first   question  " },
        },
        {
          type: "session_info",
          id: "name-1",
          parentId: "user-1",
          timestamp: "2026-07-19T10:03:00.000Z",
          name: "  Investigation  ",
        },
      ]
        .map((entry) => JSON.stringify(entry))
        .join("\n"),
    );

    await expect(
      readSessionFileSummary(path, new Date("2026-07-19T10:04:00.000Z")),
    ).resolves.toEqual({
      sessionId: "session-1",
      displayName: "Investigation",
      displayLabel: "Investigation",
      createdAt: "2026-07-19T10:00:00.000Z",
      modifiedAt: "2026-07-19T10:04:00.000Z",
    });
  });

  it("lets the latest session-info entry clear the name", async () => {
    const dir = await mkdtemp(join(tmpdir(), "uix-session-summary-"));
    dirs.push(dir);
    const path = join(dir, "session.jsonl");
    await writeFile(
      path,
      [
        {
          type: "session",
          version: 3,
          id: "session-1",
          timestamp: "2026-07-19T10:00:00.000Z",
          cwd: "/tmp/ws",
        },
        { type: "session_info", name: "Old name" },
        {
          type: "message",
          message: { role: "user", content: "fallback question" },
        },
        { type: "session_info", name: "" },
      ]
        .map((entry) => JSON.stringify(entry))
        .join("\n"),
    );

    await expect(
      readSessionFileSummary(path, new Date("2026-07-19T10:04:00.000Z")),
    ).resolves.toMatchObject({
      displayLabel: "fallback question",
    });
  });

  it("skips a file without a valid session header", async () => {
    const dir = await mkdtemp(join(tmpdir(), "uix-session-summary-"));
    dirs.push(dir);
    const path = join(dir, "session.jsonl");
    await writeFile(path, '{"type":"message"}\n');

    await expect(
      readSessionFileSummary(path, new Date(0)),
    ).resolves.toBeUndefined();
  });
});

describe("readSessionSummary", () => {
  it("prefers an explicit display name", async () => {
    await expect(
      readSessionSummary(
        fakeManager({
          displayName: "Investigation",
          entries: [userMessage("first question")],
        }),
      ),
    ).resolves.toEqual({
      sessionId: "session-1",
      displayName: "Investigation",
      displayLabel: "Investigation",
      createdAt: "2026-07-19T10:00:00.000Z",
      modifiedAt: "2026-07-19T10:00:00.000Z",
    });
  });

  it("collapses and truncates the first user message fallback", async () => {
    const summary = await readSessionSummary(
      fakeManager({
        entries: [userMessage(`  ${"word ".repeat(30)}  `)],
      }),
    );

    expect(summary.displayName).toBeUndefined();
    expect(summary.displayLabel).toHaveLength(80);
    expect(summary.displayLabel).not.toContain("  ");
    expect(summary.displayLabel.endsWith("…")).toBe(true);
  });

  it("labels a session without a user message as a new conversation", async () => {
    await expect(readSessionSummary(fakeManager({}))).resolves.toMatchObject({
      displayLabel: "New conversation",
    });
  });
});
