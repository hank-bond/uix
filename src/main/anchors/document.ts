// UIX cockpit — anchored line editor core.
//
// The document is a doubly-linked list of line nodes plus a Map<anchor, Node>
// for O(1) anchor lookup. Edits patch the list in place and never touch
// unchanged nodes — there is no positional index to keep in sync, because
// the anchored grammar addresses lines by anchor, not by line number.
//
// Range edits (`edit({ start, end, replacement })`) run Myers diff against
// the range only, so cost is O(range + replacement). Full-document writes
// (`write(text)`) run Myers against the whole list, so cost is O(N + D); the
// linked-list splice still avoids any work on unchanged nodes after the
// diff.

import {
  ANCHOR_GUTTER_DELIMITER,
  type AnchorAllocation,
  getDefaultAnchorPool,
} from "./pool";

export interface AnchoredLine {
  readonly anchor: string;
  readonly text: string;
}

export interface AnchoredMaterialization {
  readonly text: string;
  readonly anchoredText: string;
  readonly lines: readonly AnchoredLine[];
  readonly nextAnchorIndex: number;
}

export interface AnchoredChange {
  readonly oldLines: readonly AnchoredLine[];
  readonly newLines: readonly AnchoredLine[];
}

export interface AnchoredResult extends AnchoredMaterialization {
  readonly changes: readonly AnchoredChange[];
}

export interface AnchorRangeEdit {
  readonly startLine: string;
  readonly endLine: string;
  readonly replacement: string;
}

export type AnchoredEdit = AnchorRangeEdit;

// Internal linked-list node. Sentinels carry no anchor and never appear in
// the node map; they exist only to simplify splice logic at the list ends.
class LineNode {
  prev!: LineNode;
  next!: LineNode;
  constructor(
    readonly anchor: string,
    public text: string,
  ) {}
}

interface DiffEqual {
  readonly type: "equal";
  readonly oldIndex: number;
  readonly newIndex: number;
}

interface DiffDelete {
  readonly type: "delete";
  readonly oldIndex: number;
}

interface DiffInsert {
  readonly type: "insert";
  readonly newIndex: number;
}

type DiffStep = DiffEqual | DiffDelete | DiffInsert;

interface DiffApplication {
  readonly newNodes: readonly LineNode[];
  readonly changes: readonly AnchoredChange[];
}

export class AnchoredDocument {
  // Sentinel head/tail. Real nodes live strictly between them.
  readonly #head = createSentinel();
  readonly #tail = createSentinel();
  // anchor -> node. Sentinels are not in this map.
  readonly #nodes = new Map<string, LineNode>();
  #nextAnchorIndex: number;
  readonly #allocate: (index: number) => AnchorAllocation;

  constructor(
    text = "",
    opts: {
      readonly nextAnchorIndex?: number;
      readonly allocate?: (index: number) => AnchorAllocation;
    } = {},
  ) {
    this.#allocate =
      opts.allocate ?? ((index) => getDefaultAnchorPool().allocate(index));
    this.#nextAnchorIndex = opts.nextAnchorIndex ?? 0;

    this.#head.next = this.#tail;
    this.#tail.prev = this.#head;

    for (const lineText of splitText(text)) {
      this.#insertBefore(this.#createNode(lineText), this.#tail);
    }
  }

  materialize(): AnchoredMaterialization {
    return this.#materialize();
  }

  read(): AnchoredResult {
    const materialized = this.#materialize();
    return {
      ...materialized,
      changes: [{ oldLines: [], newLines: materialized.lines }],
    };
  }

  write(text: string): AnchoredResult {
    const oldNodes = this.#collectNodes();
    const { newNodes, changes } = this.#applyDiff(oldNodes, splitText(text));
    this.#spliceRange(this.#head, this.#tail, oldNodes, newNodes);
    return { ...this.#materialize(), changes };
  }

  edit(edit: AnchoredEdit): AnchoredResult {
    const startNode = this.#requireLine(edit.startLine);
    const endNode = this.#requireLine(edit.endLine);
    const rangeNodes = this.#collectRange(startNode, endNode);
    const { newNodes, changes } = this.#applyDiff(
      rangeNodes,
      splitText(edit.replacement),
    );
    this.#spliceRange(startNode.prev, endNode.next, rangeNodes, newNodes);
    return { ...this.#materialize(), changes };
  }

  // --- internals ---

  // Diff oldNodes against newTexts; produce a sequence of nodes that should
  // occupy the (now-vacant) slot in the list, reusing nodes for equal steps
  // and allocating new ones for inserts. Returns change hunks so callers can
  // surface them to the agent.
  #applyDiff(
    oldNodes: readonly LineNode[],
    newTexts: readonly string[],
  ): DiffApplication {
    const oldTexts = oldNodes.map((node) => node.text);
    const newNodes: LineNode[] = [];
    const changes: AnchoredChange[] = [];
    let pending:
      | { oldLines: AnchoredLine[]; newLines: AnchoredLine[] }
      | undefined;

    const flushPending = () => {
      if (!pending) return;
      changes.push({ oldLines: pending.oldLines, newLines: pending.newLines });
      pending = undefined;
    };

    const ensurePending = () => (pending ??= { oldLines: [], newLines: [] });

    for (const step of diffLines(oldTexts, newTexts)) {
      if (step.type === "equal") {
        flushPending();
        // Reuse the existing node — its anchor and text are unchanged.
        newNodes.push(oldNodes[step.oldIndex]);
        continue;
      }

      const change = ensurePending();
      if (step.type === "delete") {
        const node = oldNodes[step.oldIndex];
        change.oldLines.push({ anchor: node.anchor, text: node.text });
        continue;
      }

      const node = this.#createNode(newTexts[step.newIndex] ?? "");
      newNodes.push(node);
      change.newLines.push({ anchor: node.anchor, text: node.text });
    }

    flushPending();
    return { newNodes, changes };
  }

  #createNode(text: string): LineNode {
    const allocation = this.#allocate(this.#nextAnchorIndex);
    this.#nextAnchorIndex = allocation.nextIndex;
    return new LineNode(allocation.anchor, text);
  }

  #insertBefore(node: LineNode, after: LineNode): void {
    const before = after.prev;
    node.prev = before;
    node.next = after;
    before.next = node;
    after.prev = node;
    this.#nodes.set(node.anchor, node);
  }

  // Detach oldNodes (those that aren't being reused in newNodes), then relink
  // `before <-> newNodes... <-> after`. Reused nodes keep their identity, so
  // unchanged anchors are never touched.
  #spliceRange(
    before: LineNode,
    after: LineNode,
    oldNodes: readonly LineNode[],
    newNodes: readonly LineNode[],
  ): void {
    const reused = new Set(newNodes.map((node) => node.anchor));
    for (const old of oldNodes) {
      if (!reused.has(old.anchor)) {
        this.#nodes.delete(old.anchor);
      }
    }

    let prev = before;
    for (const node of newNodes) {
      prev.next = node;
      node.prev = prev;
      prev = node;
      // Reused nodes are already in the map; only register newly allocated ones.
      if (!this.#nodes.has(node.anchor)) {
        this.#nodes.set(node.anchor, node);
      }
    }
    prev.next = after;
    after.prev = prev;
  }

  #requireNode(anchor: string): LineNode {
    const node = this.#nodes.get(anchor);
    if (!node) throw new Error(`Unknown anchor: ${anchor}`);
    return node;
  }

  #requireLine(line: string): LineNode {
    const { anchor, text } = parseAnchoredLine(line);
    const node = this.#requireNode(anchor);
    if (node.text !== text) {
      throw new Error(
        `Anchor ${anchor} text mismatch: document has ${JSON.stringify(
          node.text,
        )} but edit referenced ${JSON.stringify(text)}`,
      );
    }
    return node;
  }

  #collectNodes(): LineNode[] {
    const nodes: LineNode[] = [];
    for (let cur = this.#head.next; cur !== this.#tail; cur = cur.next) {
      nodes.push(cur);
    }
    return nodes;
  }

  // Single pass over the list: build the line list and both string
  // renderings (plain `text` and gutter `anchoredText`) at once, instead of
  // walking the document once to collect lines and twice more to map each
  // rendering.
  #materialize(): AnchoredMaterialization {
    const lines: AnchoredLine[] = [];
    const textParts: string[] = [];
    const anchoredParts: string[] = [];
    for (let cur = this.#head.next; cur !== this.#tail; cur = cur.next) {
      const line: AnchoredLine = { anchor: cur.anchor, text: cur.text };
      lines.push(line);
      textParts.push(cur.text);
      anchoredParts.push(formatAnchoredLine(line));
    }
    return {
      text: textParts.join("\n"),
      anchoredText: anchoredParts.join("\n"),
      lines,
      nextAnchorIndex: this.#nextAnchorIndex,
    };
  }

  #collectRange(startNode: LineNode, endNode: LineNode): LineNode[] {
    const nodes: LineNode[] = [];
    let cur: LineNode = startNode;
    for (;;) {
      nodes.push(cur);
      if (cur === endNode) return nodes;
      if (cur.next === this.#tail) {
        throw new Error(
          `Invalid anchor range: ${startNode.anchor} does not precede ${endNode.anchor}`,
        );
      }
      cur = cur.next;
    }
  }
}

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

export function splitText(text: string): string[] {
  if (text === "") return [];
  return text.split("\n");
}

function createSentinel(): LineNode {
  const node = new LineNode("", "");
  node.prev = node;
  node.next = node;
  return node;
}

function diffLines(
  oldLines: readonly string[],
  newLines: readonly string[],
): DiffStep[] {
  const maxDistance = oldLines.length + newLines.length;
  let frontier = new Map<number, number>([[1, 0]]);
  const trace: Array<Map<number, number>> = [];

  for (let distance = 0; distance <= maxDistance; distance += 1) {
    const nextFrontier = new Map<number, number>();

    for (let diagonal = -distance; diagonal <= distance; diagonal += 2) {
      const x = chooseNextX(frontier, diagonal, distance);
      let snakeX = x;
      let snakeY = snakeX - diagonal;

      while (
        snakeX < oldLines.length &&
        snakeY < newLines.length &&
        oldLines[snakeX] === newLines[snakeY]
      ) {
        snakeX += 1;
        snakeY += 1;
      }

      nextFrontier.set(diagonal, snakeX);

      if (snakeX >= oldLines.length && snakeY >= newLines.length) {
        trace.push(nextFrontier);
        return backtrackDiff(trace, oldLines, newLines);
      }
    }

    trace.push(nextFrontier);
    frontier = nextFrontier;
  }

  return [];
}

function chooseNextX(
  frontier: ReadonlyMap<number, number>,
  diagonal: number,
  distance: number,
): number {
  if (
    diagonal === -distance ||
    (diagonal !== distance &&
      (frontier.get(diagonal - 1) ?? Number.NEGATIVE_INFINITY) <
        (frontier.get(diagonal + 1) ?? Number.NEGATIVE_INFINITY))
  ) {
    return frontier.get(diagonal + 1) ?? 0;
  }

  return (frontier.get(diagonal - 1) ?? 0) + 1;
}

function backtrackDiff(
  trace: readonly ReadonlyMap<number, number>[],
  oldLines: readonly string[],
  newLines: readonly string[],
): DiffStep[] {
  const steps: DiffStep[] = [];
  let x = oldLines.length;
  let y = newLines.length;

  for (let distance = trace.length - 1; distance > 0; distance -= 1) {
    const previousFrontier = trace[distance - 1];
    const diagonal = x - y;
    const previousDiagonal = choosePreviousDiagonal(
      previousFrontier,
      diagonal,
      distance,
    );
    const previousX = previousFrontier.get(previousDiagonal) ?? 0;
    const previousY = previousX - previousDiagonal;

    while (x > previousX && y > previousY) {
      steps.push({ type: "equal", oldIndex: x - 1, newIndex: y - 1 });
      x -= 1;
      y -= 1;
    }

    if (x === previousX) {
      steps.push({ type: "insert", newIndex: previousY });
    } else {
      steps.push({ type: "delete", oldIndex: previousX });
    }

    x = previousX;
    y = previousY;
  }

  while (x > 0 && y > 0) {
    steps.push({ type: "equal", oldIndex: x - 1, newIndex: y - 1 });
    x -= 1;
    y -= 1;
  }

  return steps.reverse();
}

function choosePreviousDiagonal(
  previousFrontier: ReadonlyMap<number, number>,
  diagonal: number,
  distance: number,
): number {
  if (
    diagonal === -distance ||
    (diagonal !== distance &&
      (previousFrontier.get(diagonal - 1) ?? Number.NEGATIVE_INFINITY) <
        (previousFrontier.get(diagonal + 1) ?? Number.NEGATIVE_INFINITY))
  ) {
    return diagonal + 1;
  }

  return diagonal - 1;
}
