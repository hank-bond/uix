import { describe, expect, it } from "vitest";

import {
  formatAnchoredLine,
  formatAnchoredText,
  parseAnchoredLine,
} from "./wire";

describe("anchor wire format", () => {
  it("renders a line as anchor + gutter + text", () => {
    expect(formatAnchoredLine({ anchor: "A", text: "one" })).toBe("A§one");
  });

  it("renders a line list joined by newlines", () => {
    expect(
      formatAnchoredText([
        { anchor: "A", text: "one" },
        { anchor: "B", text: "two" },
        { anchor: "C", text: "three" },
      ]),
    ).toBe("A§one\nB§two\nC§three");
  });

  it("parses a rendered line back into anchor and text", () => {
    expect(parseAnchoredLine("A§one")).toEqual({ anchor: "A", text: "one" });
  });

  it("round-trips format and parse", () => {
    const line = { anchor: "B", text: "  indented text  " };
    expect(parseAnchoredLine(formatAnchoredLine(line))).toEqual(line);
  });

  it("treats only the first gutter as the delimiter", () => {
    // Text that itself contains the gutter delimiter: the first § splits, the
    // rest stays in the text.
    expect(parseAnchoredLine("A§a § b")).toEqual({
      anchor: "A",
      text: "a § b",
    });
  });

  it("throws on a line with no gutter delimiter", () => {
    expect(() => parseAnchoredLine("two")).toThrow(/Malformed anchored line/u);
  });
});
