import type { SessionEntry } from "@earendil-works/pi-coding-agent";
import { describe, expect, it } from "vitest";

import { deriveTranscriptItems } from "./transcript";

// Assert the resumed transcript a session shows: item kind, order, and final
// durable tool rows, not the entry plumbing it came from. Entries are
// fabricated to the minimal shape the mapping reads.
const entry = (
  type: string,
  message?: unknown,
  extra: object = {},
): SessionEntry =>
  ({
    type,
    id: `${type}:${String(Math.random())}`,
    parentId: null,
    timestamp: "",
    ...(message ? { message } : {}),
    ...extra,
  }) as SessionEntry;

describe("deriveTranscriptItems", () => {
  it("keeps user and assistant text in order", () => {
    const items = deriveTranscriptItems(
      [
        entry("message", { role: "user", content: "hello" }),
        entry("message", {
          role: "assistant",
          content: [{ type: "text", text: "hi there" }],
        }),
      ],
      "/workspace",
    );
    expect(items).toEqual([
      expect.objectContaining({ kind: "user", text: "hello" }),
      expect.objectContaining({
        kind: "assistant",
        text: "hi there",
        complete: true,
      }),
    ]);
  });

  it("joins text blocks and preserves tool calls/results", () => {
    const assistant = entry("message", {
      role: "assistant",
      content: [
        { type: "text", text: "before " },
        {
          type: "toolCall",
          id: "call-1",
          name: "canvas__anchor_write",
          arguments: { key: "main" },
        },
        { type: "text", text: "after" },
      ],
    });
    const result = entry("message", {
      role: "toolResult",
      toolCallId: "call-1",
      toolName: "canvas__anchor_write",
      content: [{ type: "text", text: "wrote canvas" }],
      details: { lines: 3 },
      isError: false,
    });

    const items = deriveTranscriptItems([assistant, result], "/workspace");

    expect(items).toEqual([
      expect.objectContaining({
        kind: "assistant",
        text: "before after",
        complete: true,
      }),
      expect.objectContaining({
        kind: "tool",
        toolCallId: "call-1",
        toolName: "canvas__anchor_write",
        cwd: "/workspace",
        args: { key: "main" },
        result: {
          content: [{ type: "text", text: "wrote canvas" }],
          details: { lines: 3 },
        },
        isError: false,
        complete: true,
      }),
    ]);
  });

  it("derives point-in-time cwd and tool file locations", () => {
    const items = deriveTranscriptItems(
      [
        entry("message", {
          role: "assistant",
          content: [
            {
              type: "toolCall",
              id: "read-1",
              name: "read",
              arguments: { path: "src/main.ts" },
            },
          ],
        }),
        entry("custom", undefined, {
          customType: "uix.turn-state",
          data: { cwd: "/worktree/nested", state: {} },
        }),
        entry("message", {
          role: "assistant",
          content: [
            {
              type: "toolCall",
              id: "write-1",
              name: "write",
              arguments: { path: "../outside.ts", content: "export {};" },
            },
          ],
        }),
      ],
      "/workspace",
    );

    expect(items).toEqual([
      expect.objectContaining({
        kind: "tool",
        toolCallId: "read-1",
        cwd: "/workspace",
        file: {
          absolutePath: "/workspace/src/main.ts",
          displayPath: "src/main.ts",
        },
      }),
      expect.objectContaining({
        kind: "tool",
        toolCallId: "write-1",
        cwd: "/worktree/nested",
        file: {
          absolutePath: "/worktree/outside.ts",
          displayPath: "/worktree/outside.ts",
        },
      }),
    ]);
  });

  it("keeps displayed custom messages and drops non-transcript state", () => {
    const items = deriveTranscriptItems(
      [
        entry("model_change"),
        entry("custom", undefined, {
          customType: "uix.state",
          data: { x: 1 },
        }),
        entry("custom_message", undefined, {
          customType: "uix.notice",
          content: "notice",
          display: true,
          details: { severity: "info" },
        }),
        entry("message", { role: "user", content: "   " }),
      ],
      "/workspace",
    );

    expect(items).toEqual([
      expect.objectContaining({
        kind: "custom",
        customType: "uix.notice",
        content: "notice",
        display: true,
        details: { severity: "info" },
      }),
    ]);
  });
});
