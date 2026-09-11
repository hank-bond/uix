import { describe, expect, it } from "vitest";

import { extractTextContent, truncateText } from "./transcript-text";

describe("transcript text extraction", () => {
  it.each([
    "",
    [""],
    [{ type: "text", text: "" }],
    { content: [{ type: "text", text: "" }] },
    {
      content: [
        { type: "text", text: "" },
        { type: "text", text: "" },
      ],
    },
  ])("preserves recognized empty text: %j", (value) => {
    expect(extractTextContent(value)).toBe("");
    expect(truncateText(extractTextContent(value))).toBe("");
  });

  it("joins text blocks without trimming whitespace", () => {
    expect(
      extractTextContent({
        content: [
          { type: "text", text: "" },
          { type: "text", text: " first\n" },
          { type: "text", text: "second " },
        ],
      }),
    ).toBe(" first\nsecond ");
  });

  it.each([[], [{ count: 2 }], [{ type: "text", text: 2 }], { count: 2 }])(
    "retains unknown structured content for the JSON fallback: %j",
    (value) => {
      expect(extractTextContent(value)).toBe(value);
      expect(truncateText(extractTextContent(value))).toBe(
        JSON.stringify(value, undefined, 2),
      );
    },
  );

  it("keeps absent output distinct from empty text", () => {
    expect(truncateText(undefined)).toBeUndefined();
    expect(truncateText(null)).toBeUndefined();
    expect(truncateText("abcdef", 3)).toBe("abc…");
  });
});
