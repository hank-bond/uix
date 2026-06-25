// anchored line editor core.
//
// The document is a doubly-linked list of line nodes plus a Map<anchor, Node>
// for O(1) anchor lookup. Edits patch the list in place and never touch
// unchanged nodes — there is no positional index to keep in sync, because
// the anchored grammar addresses lines by anchor, not by line number.
//
// Range edits (`edit`) run Myers diff against the range only, so cost is
// O(range + replacement). `reconcile(text)` runs Myers against the whole list
// to preserve unchanged anchors and report a diff, so cost is O(N + D).
// `write(text)` is a clobber — it rebuilds from scratch with fresh anchors and
// no diff, so cost is O(new line count).
//
// `read(start, end)` slices by line position (the one positional operation —
// the first read has no anchors yet). A linked list has no random seek, so it
// walks to the window; using the tracked line count it enters from whichever
// document end is nearer, making cost O(min(start, N - end) + window).

import { type AnchorAllocation, getDefaultAnchorPool } from "./pool";

export interface AnchoredLine {
  readonly anchor: string;
  readonly text: string;
}

export interface AnchoredChange {
  readonly oldLines: readonly AnchoredLine[];
  readonly newLines: readonly AnchoredLine[];
}

export interface AnchoredDocumentSnapshot {
  readonly lines: readonly AnchoredLine[];
  readonly nextAnchorIndex: number;
}

export interface AnchorRangeEdit {
  // Boundaries are structured lines (anchor + the text the caller believes is
  // there), not rendered strings — the §-gutter wire format is parsed at the
  // tool layer before it reaches the core. The text half is a verbatim guard:
  // `edit` rejects the call unless the live line behind the anchor still
  // matches, the same way an edit tool requires the old text to match before
  // replacing it.
  readonly start: AnchoredLine;
  readonly end: AnchoredLine;
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
  // Live line count, maintained on every mutation so range reads can pick the
  // nearer end to seek from without an O(N) walk just to learn the length.
  #lineCount = 0;
  #nextAnchorIndex: number;
  readonly #allocate: (index: number) => AnchorAllocation;

  constructor(
    text?: string,
    opts?: {
      readonly nextAnchorIndex?: number;
      readonly allocate?: (index: number) => AnchorAllocation;
    },
  );
  constructor(snapshot: AnchoredDocumentSnapshot);
  constructor(
    input: string | AnchoredDocumentSnapshot = "",
    opts: {
      readonly nextAnchorIndex?: number;
      readonly allocate?: (index: number) => AnchorAllocation;
    } = {},
  ) {
    if (typeof input === "string") {
      this.#allocate =
        opts.allocate ?? ((index) => getDefaultAnchorPool().allocate(index));
      this.#nextAnchorIndex = opts.nextAnchorIndex ?? 0;
      this.#load(input);
      return;
    }

    this.#allocate = (index) => getDefaultAnchorPool().allocate(index);
    this.#nextAnchorIndex = 0;
    this.#loadSnapshot(input);
  }

  // Pool allocation cursor — internal session state, not part of any
  // agent-facing result. Exposed only so persistence can round-trip it back
  // through the constructor.
  get nextAnchorIndex(): number {
    return this.#nextAnchorIndex;
  }

  // Total line count — the "of N" for paged head/tail reads.
  get lineCount(): number {
    return this.#lineCount;
  }

  // Exact anchor-state image for durable canvas versions. Restoring this keeps
  // historical transcript anchors addressable after resume or branch preview;
  // losing it degrades to rebuilding from plain content.
  toSnapshot(): AnchoredDocumentSnapshot {
    return {
      lines: this.read(),
      nextAnchorIndex: this.#nextAnchorIndex,
    };
  }

  // Read a half-open line range `[start, end)`, Python-slice style: omit both
  // for the whole document, omit `end` for `[start:]`, omit `start` for
  // `[:end]`. Indices are clamped into range; an empty or inverted range
  // returns []. Seeks from whichever document end is nearer the window.
  read(start?: number, end?: number): readonly AnchoredLine[] {
    const count = this.#lineCount;
    const from = clamp(start ?? 0, 0, count);
    const to = clamp(end ?? count, from, count);
    const len = to - from;
    if (len === 0) return [];
    return from <= count - to
      ? this.#sliceFromHead(from, len)
      : this.#sliceFromTail(count - to, len);
  }

  // Clobber: discard the whole document and rebuild from `text`. Anchors are
  // never reused — allocation continues from the current index, so the new
  // version shares no anchor with the version it replaced (the two can coexist
  // in one chat without an anchor ever naming two different lines). No diff: a
  // clobber doesn't claim to preserve anything, so there are no change hunks.
  write(text: string): readonly AnchoredLine[] {
    this.#load(text);
    return this.read();
  }

  // Replace an inclusive anchor range, diffing only the range so unchanged
  // lines inside it keep their anchors.
  edit(edit: AnchoredEdit): readonly AnchoredChange[] {
    const startNode = this.#requireMatchingLine(edit.start);
    const endNode = this.#requireMatchingLine(edit.end);
    const rangeNodes = this.#collectRange(startNode, endNode);
    const { newNodes, changes } = this.#applyDiff(
      rangeNodes,
      splitText(edit.replacement),
    );
    this.#spliceRange(startNode.prev, endNode.next, rangeNodes, newNodes);
    return changes;
  }

  // Reconcile the whole document against new `text`, diffing to preserve the
  // anchors of unchanged lines and report what changed. This is the human
  // writeback path (the pane flushes new content; the agent must see a stable
  // anchored diff) — unlike `write`, it is not a clobber.
  reconcile(text: string): readonly AnchoredChange[] {
    const oldNodes = this.#collectNodes();
    const { newNodes, changes } = this.#applyDiff(oldNodes, splitText(text));
    this.#spliceRange(this.#head, this.#tail, oldNodes, newNodes);
    return changes;
  }

  // --- internals ---

  // Reset to an empty list and build it from `text`. Allocation continues from
  // the current #nextAnchorIndex, so a rebuild never reuses a prior anchor.
  #load(text: string): void {
    this.#nodes.clear();
    this.#head.next = this.#tail;
    this.#tail.prev = this.#head;
    const lines = splitText(text);
    for (const lineText of lines) {
      this.#insertBefore(this.#createNode(lineText), this.#tail);
    }
    this.#lineCount = lines.length;
  }

  #loadSnapshot(snapshot: AnchoredDocumentSnapshot): void {
    this.#nodes.clear();
    this.#head.next = this.#tail;
    this.#tail.prev = this.#head;
    this.#nextAnchorIndex = snapshot.nextAnchorIndex;
    const seen = new Set<string>();
    for (const line of snapshot.lines) {
      if (seen.has(line.anchor)) {
        throw new Error(`Duplicate anchor in snapshot: ${line.anchor}`);
      }
      seen.add(line.anchor);
      this.#insertBefore(new LineNode(line.anchor, line.text), this.#tail);
    }
    this.#lineCount = snapshot.lines.length;
  }

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

    // The spliced region went from oldNodes.length to newNodes.length lines.
    this.#lineCount += newNodes.length - oldNodes.length;
  }

  #requireNode(anchor: string): LineNode {
    const node = this.#nodes.get(anchor);
    if (!node) throw new Error(`Unknown anchor: ${anchor}`);
    return node;
  }

  #requireMatchingLine(line: AnchoredLine): LineNode {
    const node = this.#requireNode(line.anchor);
    if (node.text !== line.text) {
      throw new Error(
        `Anchor ${line.anchor} text mismatch: document has ${JSON.stringify(
          node.text,
        )} but edit referenced ${JSON.stringify(line.text)}`,
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

  // Collect `len` lines starting at index `seek`, walking forward from the
  // head. Caller guarantees `seek + len <= lineCount`, so we never hit the
  // tail sentinel mid-collection.
  #sliceFromHead(seek: number, len: number): AnchoredLine[] {
    let cur = this.#head.next;
    for (let i = 0; i < seek; i += 1) cur = cur.next;
    const out = new Array<AnchoredLine>(len);
    for (let i = 0; i < len; i += 1) {
      out[i] = { anchor: cur.anchor, text: cur.text };
      cur = cur.next;
    }
    return out;
  }

  // Collect `len` lines ending `seek` lines before the tail, walking backward.
  // We fill a pre-sized array from the back so the result is forward-ordered
  // with no reverse and no front-insertion. Caller guarantees the window fits.
  #sliceFromTail(seek: number, len: number): AnchoredLine[] {
    let cur = this.#tail.prev;
    for (let i = 0; i < seek; i += 1) cur = cur.prev;
    const out = new Array<AnchoredLine>(len);
    for (let i = len - 1; i >= 0; i -= 1) {
      out[i] = { anchor: cur.anchor, text: cur.text };
      cur = cur.prev;
    }
    return out;
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

export function splitText(text: string): string[] {
  if (text === "") return [];
  return text.split("\n");
}

function clamp(value: number, lo: number, hi: number): number {
  return Math.min(Math.max(value, lo), hi);
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
