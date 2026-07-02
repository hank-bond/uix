// anchor wire format.
//
// How anchored lines are rendered to, and parsed from, the agent. The document
// core deals only in structured `{ anchor, text }`; the §-gutter representation
// is a protocol detail that lives here, at the agent boundary (the pi tool
// layer uses these to render results for the agent and to parse the lines the
// agent echoes back). The core never sees the delimiter.

import type { AnchoredLine } from "./document";

export const ANCHOR_GUTTER_DELIMITER = "§";

export function formatAnchoredText(lines: readonly AnchoredLine[]): string {
  return lines.map(formatAnchoredLine).join("\n");
}

export function formatAnchoredLine(line: AnchoredLine): string {
  return `${line.anchor}${ANCHOR_GUTTER_DELIMITER}${line.text}`;
}

// Inverse of formatAnchoredLine: "A§one" -> { anchor: "A", text: "one" }.
export function parseAnchoredLine(line: string): AnchoredLine {
  const gutterIdx = line.indexOf(ANCHOR_GUTTER_DELIMITER);
  if (gutterIdx === -1) {
    throw new Error(`Malformed anchored line: ${JSON.stringify(line)}`);
  }
  return {
    anchor: line.slice(0, gutterIdx),
    text: line.slice(gutterIdx + ANCHOR_GUTTER_DELIMITER.length),
  };
}
