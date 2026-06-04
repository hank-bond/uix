import { env, stdout } from "node:process";
import { performance } from "node:perf_hooks";

import { describe, expect, it } from "vitest";

import {
  AnchoredDocument,
  formatAnchoredLine,
  type AnchoredLine,
} from "./document";

const RANDOM_SEED = 0xced1_500;
const WINDOW_EDIT_SIZE = 500;
const WINDOW_KEEP_PREFIX = 225;
const WINDOW_KEEP_SUFFIX_START = 275;

function makeText(count: number): string {
  return Array.from({ length: count }, (_, index) => `line-${index}`).join(
    "\n",
  );
}

function seededRandom(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1_664_525 + 1_013_904_223) >>> 0;
    return state / 0x1_0000_0000;
  };
}

function randomInt(random: () => number, maxExclusive: number): number {
  return Math.floor(random() * maxExclusive);
}

function lineAt(lines: readonly AnchoredLine[], index: number): AnchoredLine {
  const line = lines[index];
  expect(line).toBeDefined();
  return line;
}

function buildWindowReplacement(
  texts: readonly string[],
  startIndex: number,
  editIndex: number,
  label: string,
): string[] {
  return [
    ...texts.slice(startIndex, startIndex + WINDOW_KEEP_PREFIX),
    `${label}-${editIndex}-a`,
    `${label}-${editIndex}-b`,
    ...texts.slice(
      startIndex + WINDOW_KEEP_SUFFIX_START,
      startIndex + WINDOW_EDIT_SIZE,
    ),
  ];
}

function textFromLines(lines: readonly AnchoredLine[]): string[] {
  return lines.map((line) => line.text);
}

function expectValidSnapshot(
  lines: readonly AnchoredLine[],
  expectedText: readonly string[],
): void {
  expect(lines.map((line) => line.text)).toEqual(expectedText);
  expect(new Set(lines.map((line) => line.anchor)).size).toBe(lines.length);
}

function summarizeTimings(samples: readonly number[]): string {
  const mean =
    samples.reduce((total, sample) => total + sample, 0) / samples.length;
  const min = Math.min(...samples);
  const max = Math.max(...samples);
  return `mean ${mean.toFixed(2)}ms, min ${min.toFixed(2)}ms, max ${max.toFixed(2)}ms`;
}

describe("AnchoredDocument stress", () => {
  it("keeps anchors stable across many localized range edits", () => {
    const doc = new AnchoredDocument(makeText(1_000));
    const model = Array.from({ length: 1_000 }, (_, index) => `line-${index}`);

    for (let editIndex = 0; editIndex < 400; editIndex += 1) {
      const before = doc.materialize().lines;
      const startIndex = (editIndex * 37) % model.length;
      const deleteCount = 1 + ((editIndex * 11) % 7);
      const endIndex = Math.min(model.length - 1, startIndex + deleteCount - 1);
      const replacement = [
        `edit-${editIndex}-a`,
        ...(editIndex % 3 === 0 ? [model[startIndex]] : []),
        `edit-${editIndex}-b`,
      ];
      const untouchedBefore = before.slice(0, startIndex);
      const untouchedAfter = before.slice(endIndex + 1);

      doc.edit({
        startLine: formatAnchoredLine(lineAt(before, startIndex)),
        endLine: formatAnchoredLine(lineAt(before, endIndex)),
        replacement: replacement.join("\n"),
      });
      model.splice(startIndex, endIndex - startIndex + 1, ...replacement);

      const after = doc.materialize().lines;
      expectValidSnapshot(after, model);
      expect(after.slice(0, untouchedBefore.length)).toEqual(untouchedBefore);
      expect(after.slice(after.length - untouchedAfter.length)).toEqual(
        untouchedAfter,
      );
    }
  });

  it("handles large writes that preserve long unchanged runs", () => {
    const original = Array.from(
      { length: 20_000 },
      (_, index) => `line-${index}`,
    );
    const doc = new AnchoredDocument(original.join("\n"));
    const before = doc.materialize().lines;
    const nextText = [
      ...original.slice(0, 9_950),
      "inserted-a",
      "inserted-b",
      ...original.slice(9_950, 10_050),
      "replacement-tail",
      ...original.slice(10_075),
    ];

    const result = doc.write(nextText.join("\n"));

    expectValidSnapshot(result.lines, nextText);
    expect(result.lines.slice(0, 9_950)).toEqual(before.slice(0, 9_950));
    expect(result.lines.slice(-500)).toEqual(before.slice(-500));
    expect(result.changes).toHaveLength(2);
  });

  it("keeps reconciling randomly placed 500-line edits over prior state", () => {
    const random = seededRandom(RANDOM_SEED);
    const doc = new AnchoredDocument(makeText(15_000));
    const model = Array.from({ length: 15_000 }, (_, index) => `line-${index}`);

    for (let editIndex = 0; editIndex < 100; editIndex += 1) {
      const before = doc.materialize().lines;
      const startIndex = randomInt(random, model.length - WINDOW_EDIT_SIZE);
      const endIndex = startIndex + WINDOW_EDIT_SIZE - 1;
      const replacement = buildWindowReplacement(
        model,
        startIndex,
        editIndex,
        "random-edit",
      );

      doc.edit({
        startLine: formatAnchoredLine(lineAt(before, startIndex)),
        endLine: formatAnchoredLine(lineAt(before, endIndex)),
        replacement: replacement.join("\n"),
      });
      model.splice(startIndex, WINDOW_EDIT_SIZE, ...replacement);

      const after = doc.materialize().lines;
      expectValidSnapshot(after, model);
      expect(after.slice(0, startIndex)).toEqual(before.slice(0, startIndex));
      expect(after.slice(startIndex, startIndex + WINDOW_KEEP_PREFIX)).toEqual(
        before.slice(startIndex, startIndex + WINDOW_KEEP_PREFIX),
      );
      expect(
        after.slice(
          startIndex + WINDOW_KEEP_PREFIX + 2,
          startIndex + replacement.length,
        ),
      ).toEqual(
        before.slice(startIndex + WINDOW_KEEP_SUFFIX_START, endIndex + 1),
      );
      expect(after.slice(startIndex + replacement.length)).toEqual(
        before.slice(endIndex + 1),
      );
    }
  });
});

const perfIt = env["UIX_ANCHOR_PERF"] === "1" ? it : it.skip;

describe("AnchoredDocument perf", () => {
  perfIt("reports timings for large localized edits", () => {
    const doc = new AnchoredDocument(makeText(100_000));
    const editSamples: number[] = [];
    const writeSamples: number[] = [];
    const sampleCount = 50;

    for (let sampleIndex = 0; sampleIndex < sampleCount; sampleIndex += 1) {
      const target = doc.materialize().lines[40_000 + sampleIndex * 500];
      expect(target).toBeDefined();
      const replacement = `middle-replacement-${sampleIndex}`;

      const start = performance.now();
      const targetLine = formatAnchoredLine(target);
      const result = doc.edit({
        startLine: targetLine,
        endLine: targetLine,
        replacement,
      });
      editSamples.push(performance.now() - start);

      const writeStart = performance.now();
      doc.write(result.text);
      writeSamples.push(performance.now() - writeStart);
    }

    stdout.write(
      [
        "",
        "AnchoredDocument perf:",
        `  samples: ${sampleCount}`,
        `  100k one-line anchored edit: ${summarizeTimings(editSamples)}`,
        `  100k unchanged write: ${summarizeTimings(writeSamples)}`,
        "",
      ].join("\n"),
    );
  });

  perfIt("reports timings for repeated random 500-line edits", () => {
    const random = seededRandom(RANDOM_SEED);
    const doc = new AnchoredDocument(makeText(100_000));
    const editSamples: number[] = [];
    const sampleCount = 50;

    for (let sampleIndex = 0; sampleIndex < sampleCount; sampleIndex += 1) {
      const before = doc.materialize().lines;
      const startIndex = randomInt(random, before.length - WINDOW_EDIT_SIZE);
      const endIndex = startIndex + WINDOW_EDIT_SIZE - 1;
      const replacement = buildWindowReplacement(
        textFromLines(before),
        startIndex,
        sampleIndex,
        "random-perf",
      );
      const startLine = formatAnchoredLine(lineAt(before, startIndex));
      const endLine = formatAnchoredLine(lineAt(before, endIndex));
      const replacementText = replacement.join("\n");

      const start = performance.now();
      doc.edit({
        startLine,
        endLine,
        replacement: replacementText,
      });
      editSamples.push(performance.now() - start);
    }

    stdout.write(
      [
        "",
        "AnchoredDocument random 500-line edit perf:",
        `  samples: ${sampleCount}`,
        `  100k repeated range edit: ${summarizeTimings(editSamples)}`,
        "",
      ].join("\n"),
    );
  });
});
