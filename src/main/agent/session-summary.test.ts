import { describe, expect, it } from "vitest";

import type { SessionManager } from "@earendil-works/pi-coding-agent";

import { readSessionSummary } from "./session-summary";

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
