import { describe, expect, it } from "vitest";

import { AnchorPool } from "./pool";

import { AnchoredDocument, diffAnchoredSnapshots } from "./document";

function testAllocate() {
  const pool = new AnchorPool("A\nB\nC\nD\nE\nF\nG\nH\nI\nJ\nK\nL\n");
  return (index: number) => pool.allocate(index);
}

describe("AnchoredDocument", () => {
  it("reads current state with stable anchors", () => {
    const doc = new AnchoredDocument("one\ntwo\nthree", {
      allocate: testAllocate(),
    });

    expect(doc.read()).toEqual([
      { anchor: "A", text: "one" },
      { anchor: "B", text: "two" },
      { anchor: "C", text: "three" },
    ]);
    expect(doc.nextAnchorIndex).toBe(3);
  });

  describe("edit", () => {
    it("replaces an inclusive one-line anchor range", () => {
      const doc = new AnchoredDocument("one\ntwo\nthree", {
        allocate: testAllocate(),
      });

      const changes = doc.edit({
        start: { anchor: "B", text: "two" },
        end: { anchor: "B", text: "two" },
        replacement: "TWO",
      });

      expect(doc.read()).toEqual([
        { anchor: "A", text: "one" },
        { anchor: "D", text: "TWO" },
        { anchor: "C", text: "three" },
      ]);
      expect(changes).toEqual([
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

      doc.edit({
        start: { anchor: "B", text: "two" },
        end: { anchor: "C", text: "three" },
        replacement: "TWO\nTHREE",
      });

      expect(doc.read()).toEqual([
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
      doc.edit({
        start: { anchor: "B", text: "two" },
        end: { anchor: "C", text: "three" },
        replacement: "two\nTHREE",
      });

      expect(doc.read()).toEqual([
        { anchor: "A", text: "one" },
        { anchor: "B", text: "two" },
        { anchor: "D", text: "THREE" },
      ]);
    });

    it("can delete an inclusive range with an empty replacement", () => {
      const doc = new AnchoredDocument("one\ntwo\nthree", {
        allocate: testAllocate(),
      });

      doc.edit({
        start: { anchor: "B", text: "two" },
        end: { anchor: "B", text: "two" },
        replacement: "",
      });

      expect(doc.read()).toEqual([
        { anchor: "A", text: "one" },
        { anchor: "C", text: "three" },
      ]);
    });

    it("survives multiple sequential edits via stable anchor lookup", () => {
      const doc = new AnchoredDocument("one\ntwo\nthree\nfour\nfive", {
        allocate: testAllocate(),
      });

      // Edit middle.
      doc.edit({
        start: { anchor: "C", text: "three" },
        end: { anchor: "C", text: "three" },
        replacement: "THREE",
      });
      // Then edit using a still-valid line from before that edit.
      doc.edit({
        start: { anchor: "A", text: "one" },
        end: { anchor: "B", text: "two" },
        replacement: "ONE\nTWO",
      });

      expect(doc.read()).toEqual([
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
        doc.edit({
          start: { anchor: "C", text: "three" },
          end: { anchor: "A", text: "one" },
          replacement: "x",
        }),
      ).toThrow(/does not precede/u);
    });

    it("throws on an unknown anchor", () => {
      const doc = new AnchoredDocument("one\ntwo", {
        allocate: testAllocate(),
      });

      expect(() =>
        doc.edit({
          start: { anchor: "Z", text: "x" },
          end: { anchor: "Z", text: "x" },
          replacement: "x",
        }),
      ).toThrow(/Unknown anchor/u);
    });

    it("throws when a boundary's text no longer matches the anchor", () => {
      const doc = new AnchoredDocument("one\ntwo\nthree", {
        allocate: testAllocate(),
      });

      // B's real text is "two"; the caller referenced a stale/mistaken line.
      expect(() =>
        doc.edit({
          start: { anchor: "B", text: "WRONG" },
          end: { anchor: "B", text: "WRONG" },
          replacement: "TWO",
        }),
      ).toThrow(/text mismatch/u);
    });
  });

  describe("write (clobber)", () => {
    it("rebuilds the document with fresh, continued anchors", () => {
      const doc = new AnchoredDocument("one\ntwo\nthree", {
        allocate: testAllocate(),
      });

      // Anchors continue from where the old version left off (A,B,C used),
      // so the clobbered version shares no anchor with it.
      const lines = doc.write("X\nY");

      expect(lines).toEqual([
        { anchor: "D", text: "X" },
        { anchor: "E", text: "Y" },
      ]);
      expect(doc.read()).toEqual(lines);
    });

    it("reassigns anchors even when the content is identical", () => {
      const doc = new AnchoredDocument("a\nb", { allocate: testAllocate() });
      const before = doc.read();

      const after = doc.write("a\nb");

      // Same text, but a clobber never reuses anchors — the two versions are
      // anchor-disjoint, so they can coexist in one chat unambiguously.
      expect(after).toEqual([
        { anchor: "C", text: "a" },
        { anchor: "D", text: "b" },
      ]);
      const beforeAnchors = new Set(before.map((line) => line.anchor));
      expect(after.every((line) => !beforeAnchors.has(line.anchor))).toBe(true);
    });
  });

  describe("reconcile", () => {
    it("preserves surrounding anchors for inserted lines", () => {
      const doc = new AnchoredDocument("one\nthree", {
        allocate: testAllocate(),
      });

      doc.reconcile("one\ntwo\nthree");

      expect(doc.read()).toEqual([
        { anchor: "A", text: "one" },
        { anchor: "C", text: "two" },
        { anchor: "B", text: "three" },
      ]);
    });

    it("preserves remaining anchors for deleted lines and reports the hunk", () => {
      const doc = new AnchoredDocument("one\ntwo\nthree", {
        allocate: testAllocate(),
      });

      const changes = doc.reconcile("one\nthree");

      expect(doc.read()).toEqual([
        { anchor: "A", text: "one" },
        { anchor: "C", text: "three" },
      ]);
      expect(changes).toEqual([
        {
          oldLines: [{ anchor: "B", text: "two" }],
          newLines: [],
        },
      ]);
    });

    it("returns no changed hunks for unchanged content and keeps anchors", () => {
      const doc = new AnchoredDocument("one\ntwo", {
        allocate: testAllocate(),
      });

      expect(doc.reconcile("one\ntwo")).toEqual([]);
      expect(doc.read()).toEqual([
        { anchor: "A", text: "one" },
        { anchor: "B", text: "two" },
      ]);
    });

    it("preserves matching duplicate lines around a change", () => {
      const doc = new AnchoredDocument("same\nold\nsame", {
        allocate: testAllocate(),
      });

      doc.reconcile("same\nnew\nsame");

      expect(doc.read()).toEqual([
        { anchor: "A", text: "same" },
        { anchor: "D", text: "new" },
        { anchor: "C", text: "same" },
      ]);
    });
  });

  describe("diffAnchoredSnapshots", () => {
    it("returns no hunks for unchanged snapshot text", () => {
      expect(
        diffAnchoredSnapshots(
          {
            lines: [
              { anchor: "A", text: "one" },
              { anchor: "B", text: "two" },
            ],
            nextAnchorIndex: 2,
          },
          {
            lines: [
              { anchor: "A", text: "one" },
              { anchor: "B", text: "two" },
            ],
            nextAnchorIndex: 2,
          },
        ),
      ).toEqual([]);
    });

    it("reports removed lines from the old snapshot and added lines from the new snapshot", () => {
      expect(
        diffAnchoredSnapshots(
          {
            lines: [
              { anchor: "A", text: "one" },
              { anchor: "B", text: "two" },
              { anchor: "C", text: "three" },
            ],
            nextAnchorIndex: 3,
          },
          {
            lines: [
              { anchor: "A", text: "one" },
              { anchor: "D", text: "TWO" },
              { anchor: "C", text: "three" },
            ],
            nextAnchorIndex: 4,
          },
        ),
      ).toEqual([
        {
          oldLines: [{ anchor: "B", text: "two" }],
          newLines: [{ anchor: "D", text: "TWO" }],
        },
      ]);
    });

    it("uses the current snapshot's anchors for inserted lines", () => {
      expect(
        diffAnchoredSnapshots(
          {
            lines: [
              { anchor: "old-a", text: "one" },
              { anchor: "old-c", text: "three" },
            ],
            nextAnchorIndex: 2,
          },
          {
            lines: [
              { anchor: "new-a", text: "one" },
              { anchor: "new-b", text: "two" },
              { anchor: "new-c", text: "three" },
            ],
            nextAnchorIndex: 3,
          },
        ),
      ).toEqual([
        {
          oldLines: [],
          newLines: [{ anchor: "new-b", text: "two" }],
        },
      ]);
    });
  });

  describe("read range", () => {
    // A=a B=b C=c D=d E=e F=f
    const sixLines = () =>
      new AnchoredDocument("a\nb\nc\nd\ne\nf", { allocate: testAllocate() });

    it("reads the whole document with no bounds", () => {
      expect(sixLines().read()).toEqual([
        { anchor: "A", text: "a" },
        { anchor: "B", text: "b" },
        { anchor: "C", text: "c" },
        { anchor: "D", text: "d" },
        { anchor: "E", text: "e" },
        { anchor: "F", text: "f" },
      ]);
    });

    it("reads [:end] (front-half, seeks from head)", () => {
      expect(sixLines().read(undefined, 2)).toEqual([
        { anchor: "A", text: "a" },
        { anchor: "B", text: "b" },
      ]);
    });

    it("reads a front-half window forward", () => {
      expect(sixLines().read(1, 3)).toEqual([
        { anchor: "B", text: "b" },
        { anchor: "C", text: "c" },
      ]);
    });

    it("reads [start:] spanning into the back half (seeks from tail)", () => {
      // forward-ordered even though collected backward from the tail
      expect(sixLines().read(2)).toEqual([
        { anchor: "C", text: "c" },
        { anchor: "D", text: "d" },
        { anchor: "E", text: "e" },
        { anchor: "F", text: "f" },
      ]);
    });

    it("reads a back-half window forward (seeks from tail)", () => {
      expect(sixLines().read(4, 6)).toEqual([
        { anchor: "E", text: "e" },
        { anchor: "F", text: "f" },
      ]);
    });

    it("clamps out-of-range bounds and returns [] for an empty/inverted range", () => {
      const doc = sixLines();
      expect(doc.read(0, 100)).toHaveLength(6);
      expect(doc.read(10, 20)).toEqual([]);
      expect(doc.read(3, 1)).toEqual([]);
    });

    it("tracks lineCount across load, edit, write, and reconcile", () => {
      const doc = sixLines();
      expect(doc.lineCount).toBe(6);

      doc.edit({
        start: { anchor: "B", text: "b" },
        end: { anchor: "C", text: "c" },
        replacement: "x",
      });
      expect(doc.lineCount).toBe(5);

      doc.reconcile("one\ntwo\nthree");
      expect(doc.lineCount).toBe(3);

      doc.write("only\ntwo");
      expect(doc.lineCount).toBe(2);
    });
  });
});
