import { describe, expect, it } from "vitest";

import { entriesToMessages } from "./history";

// Assert the resumed transcript a session *shows* — roles, order, joined text —
// not the entry plumbing it came from. Entries are fabricated to the minimal
// shape the mapping reads, so a reimplementation that still produces the same
// transcript keeps this test green.
//
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- fabricated entries
const entry = (type: string, message?: unknown): any => ({
  type,
  id: "x",
  parentId: null,
  timestamp: "",
  ...(message ? { message } : {}),
});

describe("entriesToMessages", () => {
  it("keeps user and assistant text in order", () => {
    const messages = entriesToMessages([
      entry("message", { role: "user", content: "hello" }),
      entry("message", {
        role: "assistant",
        content: [{ type: "text", text: "hi there" }],
      }),
    ]);
    expect(messages).toEqual([
      { role: "user", text: "hello" },
      { role: "assistant", text: "hi there" },
    ]);
  });

  it("joins text blocks and ignores non-text blocks", () => {
    const messages = entriesToMessages([
      entry("message", {
        role: "assistant",
        content: [
          { type: "text", text: "before " },
          { type: "toolCall", name: "uix_canvas_write", arguments: {} },
          { type: "text", text: "after" },
        ],
      }),
    ]);
    expect(messages).toEqual([{ role: "assistant", text: "before after" }]);
  });

  it("drops tool results, non-message entries, and empty messages", () => {
    const messages = entriesToMessages([
      entry("model_change"),
      entry("message", { role: "toolResult", content: "tool output" }),
      entry("message", { role: "assistant", content: [] }),
      entry("message", { role: "user", content: "   " }),
      entry("message", { role: "user", content: "kept" }),
    ]);
    expect(messages).toEqual([{ role: "user", text: "kept" }]);
  });
});
