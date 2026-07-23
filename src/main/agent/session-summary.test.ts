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
  title?: string;
  entries?: unknown[];
}): SessionManager {
  return {
    getHeader: () => ({ timestamp: "2026-07-19T10:00:00.000Z" }),
    getSessionId: () => "session-1",
    getSessionFile: () => undefined,
    getSessionName: () => options.title,
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
      summaries.map(({ sessionId, firstUserMessage }) => ({
        sessionId,
        firstUserMessage,
      })),
    ).toEqual([
      {
        sessionId: "session-1",
        firstUserMessage: { preview: "newest", truncated: false },
      },
      {
        sessionId: "session-2",
        firstUserMessage: { preview: "middle", truncated: false },
      },
    ]);
  });
});

describe("readSessionFileSummary", () => {
  it("reads the header, first user message, and latest explicit title", async () => {
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
      title: "Investigation",
      firstUserMessage: {
        preview: "first   question",
        truncated: false,
      },
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

    const summary = await readSessionFileSummary(
      path,
      new Date("2026-07-19T10:04:00.000Z"),
    );

    expect(summary?.title).toBeUndefined();
    expect(summary?.firstUserMessage).toEqual({
      preview: "fallback question",
      truncated: false,
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
  it("returns the explicit title separately from the first user message", async () => {
    await expect(
      readSessionSummary(
        fakeManager({
          title: "Investigation",
          entries: [userMessage("first question")],
        }),
      ),
    ).resolves.toEqual({
      sessionId: "session-1",
      title: "Investigation",
      firstUserMessage: { preview: "first question", truncated: false },
      createdAt: "2026-07-19T10:00:00.000Z",
      modifiedAt: "2026-07-19T10:00:00.000Z",
    });
  });

  it("preserves internal whitespace and bounds the preview by Unicode code point", async () => {
    const text = `  first\n  ${"🙂".repeat(510)}end  `;
    const summary = await readSessionSummary(
      fakeManager({ entries: [userMessage(text)] }),
    );

    expect(summary.title).toBeUndefined();
    expect(summary.firstUserMessage).toEqual({
      preview: `first\n  ${"🙂".repeat(504)}`,
      truncated: true,
    });
    expect(Array.from(summary.firstUserMessage?.preview ?? "")).toHaveLength(
      512,
    );
  });

  it("omits first-user metadata when the first user message has no text", async () => {
    const imageOnly = {
      type: "message",
      message: {
        role: "user",
        content: [{ type: "image", data: "ignored" }],
      },
    };
    await expect(
      readSessionSummary(
        fakeManager({ entries: [imageOnly, userMessage("later text")] }),
      ),
    ).resolves.toEqual({
      sessionId: "session-1",
      createdAt: "2026-07-19T10:00:00.000Z",
      modifiedAt: "2026-07-19T10:00:00.000Z",
    });
  });
});
