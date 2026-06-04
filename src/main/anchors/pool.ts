// UIX cockpit — committed anchor pool runtime.
//
// Runtime code loads the small committed newline-separated pool into memory and
// advances a per-document index through it. The pool is model-agnostic: UIX
// uses the same anchors for every model.

import anchorPoolText from "./assets/anchor-pool.txt?raw";

let defaultPool: AnchorPool | undefined;

export interface AnchorAllocation {
  anchor: string;
  /** Pool allocation index to store on the document for the next allocation. */
  nextIndex: number;
}

export class AnchorPool {
  readonly anchors: readonly string[];

  constructor(poolText: string) {
    this.anchors = poolText.split("\n").filter(Boolean);
  }

  get size(): number {
    return this.anchors.length;
  }

  get maxAllocations(): number {
    return this.anchors.length + this.anchors.length ** 2;
  }

  allocate(index: number): AnchorAllocation {
    if (this.anchors.length === 0) {
      throw new Error("Anchor pool is empty");
    }

    const normalizedIndex = normalizeIndex(index);
    if (normalizedIndex < this.anchors.length) {
      return {
        anchor: this.anchors[normalizedIndex],
        nextIndex: normalizedIndex + 1,
      };
    }

    if (normalizedIndex >= this.maxAllocations) {
      throw new Error("Anchor pool exhausted");
    }

    const [leftIndex, rightIndex] = pairIndexes(
      normalizedIndex - this.anchors.length,
      this.anchors.length,
    );

    return {
      anchor: `${this.anchors[leftIndex]}${this.anchors[rightIndex]}`,
      nextIndex: normalizedIndex + 1,
    };
  }
}

export function getDefaultAnchorPool(): AnchorPool {
  defaultPool ??= new AnchorPool(anchorPoolText);
  return defaultPool;
}

export function allocateAnchor(index: number): AnchorAllocation {
  return getDefaultAnchorPool().allocate(index);
}

function normalizeIndex(index: number): number {
  if (!Number.isSafeInteger(index) || index < 0) return 0;
  return index;
}

function pairIndexes(pairIndex: number, size: number): [number, number] {
  // Naive row-major pair iteration. The pool asset is pre-sorted so early
  // two-word anchors stay compact.
  return [Math.floor(pairIndex / size), pairIndex % size];
}
