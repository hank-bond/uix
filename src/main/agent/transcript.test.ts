import type { SessionEntry } from "@earendil-works/pi-coding-agent";

import { describe, expect, it } from "vitest";

import { deriveTranscriptItems } from "./transcript";

// Assert the resumed transcript a session shows — item kind, order, and final
// durable tool rows — not the entry plumbing it came from. Entries are
// fabricated to the minimal shape the mapping reads.
const entry = (
  type: string,
  message?: unknown,
  extra: object = {},
): SessionEntry =>
  ({
    type,
    id: `${type}:${Math.random()}`,
    parentId: null,
    timestamp: "",
    ...(message ? { message } : {}),
    ...extra,
  }) as SessionEntry;

describe("deriveTranscriptItems", () => {
  it("keeps user and assistant text in order", () => {
    const items = deriveTranscriptItems([
      entry("message", { role: "user", content: "hello" }),
      entry("message", {
        role: "assistant",
        content: [{ type: "text", text: "hi there" }],
      }),
    ]);
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

    const items = deriveTranscriptItems([assistant, result]);

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

  it("keeps displayed custom messages and drops non-transcript state", () => {
    const items = deriveTranscriptItems([
      entry("model_change"),
      entry("custom", undefined, { customType: "uix.state", data: { x: 1 } }),
      entry("custom_message", undefined, {
        customType: "uix.notice",
        content: "notice",
        display: true,
        details: { severity: "info" },
      }),
      entry("message", { role: "user", content: "   " }),
    ]);

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
