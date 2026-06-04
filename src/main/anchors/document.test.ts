import { describe, expect, it } from "vitest";

import { AnchorPool } from "./pool";

import { AnchoredDocument } from "./document";

function testAllocate() {
  const pool = new AnchorPool("A\nB\nC\nD\nE\nF\nG\nH\nI\nJ\nK\nL\n");
  return (index: number) => pool.allocate(index);
}

describe("AnchoredDocument", () => {
  it("reads text with stable gutter anchors", () => {
    const doc = new AnchoredDocument("one\ntwo\nthree", {
      allocate: testAllocate(),
    });

    expect(doc.read()).toMatchObject({
      text: "one\ntwo\nthree",
      anchoredText: "A§one\nB§two\nC§three",
      nextAnchorIndex: 3,
      lines: [
        { anchor: "A", text: "one" },
        { anchor: "B", text: "two" },
        { anchor: "C", text: "three" },
      ],
    });
  });

  it("replaces an inclusive one-line anchor range", () => {
    const doc = new AnchoredDocument("one\ntwo\nthree", {
      allocate: testAllocate(),
    });

    const result = doc.edit({
      startLine: "B§two",
      endLine: "B§two",
      replacement: "TWO",
    });

    expect(result.lines).toEqual([
      { anchor: "A", text: "one" },
      { anchor: "D", text: "TWO" },
      { anchor: "C", text: "three" },
    ]);
    expect(result.changes).toEqual([
      {
        oldLines: [{ anchor: "B", text: "two" }],
        newLines: [{ anchor: "D", text: "TWO" }],
      },
    ]);
  });

  it("replaces an inclusive multi-line anchor range", () => {
    const doc = new AnchoredDocument("one\ntwo\nthree\nfour", {
      allocate: testAllocate(),
    });

    const result = doc.edit({
      startLine: "B§two",
      endLine: "C§three",
      replacement: "TWO\nTHREE",
    });

    expect(result.lines).toEqual([
      { anchor: "A", text: "one" },
      { anchor: "E", text: "TWO" },
      { anchor: "F", text: "THREE" },
      { anchor: "D", text: "four" },
    ]);
  });

  it("preserves matching lines inside the replaced range", () => {
    const doc = new AnchoredDocument("one\ntwo\nthree", {
      allocate: testAllocate(),
    });

    // Replace B..C ("two\nthree") with "two\nTHREE" — "two" is unchanged
    // inside the range, so B should be reused.
    const result = doc.edit({
      startLine: "B§two",
      endLine: "C§three",
      replacement: "two\nTHREE",
    });

    expect(result.lines).toEqual([
      { anchor: "A", text: "one" },
      { anchor: "B", text: "two" },
      { anchor: "D", text: "THREE" },
    ]);
  });

  it("preserves surrounding anchors for inserted lines on write", () => {
    const doc = new AnchoredDocument("one\nthree", {
      allocate: testAllocate(),
    });

    const result = doc.write("one\ntwo\nthree");

    expect(result.lines).toEqual([
      { anchor: "A", text: "one" },
      { anchor: "C", text: "two" },
      { anchor: "B", text: "three" },
    ]);
  });

  it("preserves remaining anchors for deleted lines on write", () => {
    const doc = new AnchoredDocument("one\ntwo\nthree", {
      allocate: testAllocate(),
    });

    const result = doc.write("one\nthree");

    expect(result.lines).toEqual([
      { anchor: "A", text: "one" },
      { anchor: "C", text: "three" },
    ]);
    expect(result.changes).toEqual([
      {
        oldLines: [{ anchor: "B", text: "two" }],
        newLines: [],
      },
    ]);
  });

  it("returns no changed hunks for unchanged writes", () => {
    const doc = new AnchoredDocument("one\ntwo", {
      allocate: testAllocate(),
    });

    expect(doc.write("one\ntwo").changes).toEqual([]);
  });

  it("preserves matching duplicate lines around a change on write", () => {
    const doc = new AnchoredDocument("same\nold\nsame", {
      allocate: testAllocate(),
    });

    const result = doc.write("same\nnew\nsame");

    expect(result.lines).toEqual([
      { anchor: "A", text: "same" },
      { anchor: "D", text: "new" },
      { anchor: "C", text: "same" },
    ]);
  });

  it("can delete an inclusive range with an empty replacement", () => {
    const doc = new AnchoredDocument("one\ntwo\nthree", {
      allocate: testAllocate(),
    });

    const result = doc.edit({
      startLine: "B§two",
      endLine: "B§two",
      replacement: "",
    });

    expect(result.lines).toEqual([
      { anchor: "A", text: "one" },
      { anchor: "C", text: "three" },
    ]);
    expect(result.text).toBe("one\nthree");
  });

  it("survives multiple sequential edits via stable anchor lookup", () => {
    const doc = new AnchoredDocument("one\ntwo\nthree\nfour\nfive", {
      allocate: testAllocate(),
    });

    // Edit middle.
    doc.edit({
      startLine: "C§three",
      endLine: "C§three",
      replacement: "THREE",
    });
    // Then edit using a still-valid line from before that edit.
    const result = doc.edit({
      startLine: "A§one",
      endLine: "B§two",
      replacement: "ONE\nTWO",
    });

    expect(result.lines).toEqual([
      { anchor: "G", text: "ONE" },
      { anchor: "H", text: "TWO" },
      { anchor: "F", text: "THREE" },
      { anchor: "D", text: "four" },
      { anchor: "E", text: "five" },
    ]);
  });

  it("throws on a range whose end precedes its start", () => {
    const doc = new AnchoredDocument("one\ntwo\nthree", {
      allocate: testAllocate(),
    });

    expect(() =>
      doc.edit({ startLine: "C§three", endLine: "A§one", replacement: "x" }),
    ).toThrow(/does not precede/u);
  });

  it("throws on an unknown anchor", () => {
    const doc = new AnchoredDocument("one\ntwo", {
      allocate: testAllocate(),
    });

    expect(() =>
      doc.edit({ startLine: "Z§x", endLine: "Z§x", replacement: "x" }),
    ).toThrow(/Unknown anchor/u);
  });

  it("throws when a boundary line's text no longer matches the anchor", () => {
    const doc = new AnchoredDocument("one\ntwo\nthree", {
      allocate: testAllocate(),
    });

    // B's real text is "two"; the model referenced a stale/mistaken line.
    expect(() =>
      doc.edit({
        startLine: "B§WRONG",
        endLine: "B§WRONG",
        replacement: "TWO",
      }),
    ).toThrow(/text mismatch/u);
  });

  it("throws when a boundary line omits the anchor gutter", () => {
    const doc = new AnchoredDocument("one\ntwo", {
      allocate: testAllocate(),
    });

    expect(() =>
      doc.edit({ startLine: "two", endLine: "two", replacement: "TWO" }),
    ).toThrow(/Malformed anchored line/u);
  });

  it("matches a boundary line whose text contains the gutter delimiter", () => {
    const doc = new AnchoredDocument("a § b\ntwo", {
      allocate: testAllocate(),
    });

    // The first "§" is the gutter; the rest belongs to the line text.
    const result = doc.edit({
      startLine: "A§a § b",
      endLine: "A§a § b",
      replacement: "X",
    });

    expect(result.lines).toEqual([
      { anchor: "C", text: "X" },
      { anchor: "B", text: "two" },
    ]);
  });
});
