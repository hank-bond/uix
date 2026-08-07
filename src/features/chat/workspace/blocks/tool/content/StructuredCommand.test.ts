import { describe, expect, it } from "vitest";

import { parseCommandPieces } from "./StructuredCommand";

function texts(command: string): readonly string[] | undefined {
  return parseCommandPieces(command)?.map((piece) => piece.text);
}

describe("parseCommandPieces", () => {
  it("finds pipelines and logical groups while preserving the exact source", () => {
    const command = "one | two && alpha | beta || fallback";
    const pieces = parseCommandPieces(command);

    expect(pieces).toEqual([
      { text: "one ", kind: "source" },
      { text: "|", kind: "pipeline" },
      { text: " two ", kind: "source" },
      { text: "&& ", kind: "logical" },
      { text: "alpha ", kind: "source" },
      { text: "|", kind: "pipeline" },
      { text: " beta ", kind: "source" },
      { text: "|| ", kind: "logical" },
      { text: "fallback", kind: "source" },
    ]);
    expect(pieces?.map((piece) => piece.text).join("")).toBe(command);
  });

  it("does not structure quoted, escaped, or nested operators", () => {
    expect(texts("printf 'a|b' | cat")).toEqual(["printf 'a|b' ", "|", " cat"]);
    expect(texts(String.raw`printf a\|b | cat`)).toEqual([
      String.raw`printf a\|b `,
      "|",
      " cat",
    ]);
    expect(texts("echo $(left | right) && done")).toEqual([
      "echo $(left | right) ",
      "&& ",
      "done",
    ]);
  });

  it("keeps uncertain or already multiline shell source literal", () => {
    expect(parseCommandPieces("echo `left | right` && done")).toBeUndefined();
    expect(parseCommandPieces("left |\nright")).toBeUndefined();
    expect(parseCommandPieces("left && 'unterminated")).toBeUndefined();
  });
});
