import { describe, expect, it } from "vitest";

import { toToolParams } from "./call-presentation";

const edits = [{ oldText: "first\nsecond", newText: "third\nfourth" }];
const display =
  '[\n  {\n    "oldText": "first\nsecond",\n    "newText": "third\nfourth"\n  }\n]';

describe("tool parameter text", () => {
  it.each([edits, JSON.stringify(edits)])(
    "pretty prints structured and JSON-encoded params with visible line breaks: %j",
    (value) => {
      expect(toToolParams({ edits: value, reason: "Update text." })).toEqual([
        { key: "edits", value: display },
      ]);
    },
  );

  it("does not unescape literal backslash-n sequences in JSON strings", () => {
    const value = { path: String.raw`C:\notes\new.txt`, text: "line\nnext" };
    expect(toToolParams({ value })[0]?.value).toBe(
      '{\n  "path": "C:\\\\notes\\\\new.txt",\n  "text": "line\nnext"\n}',
    );
  });

  it("preserves raw text, indentation, and incomplete JSON", () => {
    for (const value of [
      "  line\n    next\n",
      String.raw`echo '\n'`,
      '{"edits": [',
    ]) {
      expect(toToolParams({ value })).toEqual([{ key: "value", value }]);
    }
  });

  it("keeps primitive params and excludes absent or consumed values", () => {
    expect(
      toToolParams(
        {
          timeout: 30,
          enabled: false,
          absent: null,
          content: "body",
          description: "Why",
        },
        ["content"],
      ),
    ).toEqual([
      { key: "timeout", value: "30" },
      { key: "enabled", value: "false" },
    ]);
  });
});
