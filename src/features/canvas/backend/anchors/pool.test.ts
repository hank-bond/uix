import { describe, expect, it } from "vitest";

import { AnchorPool, getDefaultAnchorPool } from "./pool";

describe("AnchorPool", () => {
  it("loads the committed pool and allocates a compact word anchor", () => {
    const pool = getDefaultAnchorPool();
    const allocation = pool.allocate(0);

    expect(pool.size).toBeGreaterThan(1000);
    expect(allocation.anchor).toMatch(/^[A-Z][A-Za-z]*$/u);
    expect(allocation.nextIndex).toBe(1);
  });

  it("uses single words first, then naive two-word pairs after exhaustion", () => {
    const pool = new AnchorPool("Able\nBaker\nCedar\n");

    expect(pool.allocate(2)).toEqual({
      anchor: "Cedar",
      nextIndex: 3,
    });
    expect(pool.allocate(3)).toEqual({
      anchor: "AbleAble",
      nextIndex: 4,
    });
    expect(pool.allocate(4)).toEqual({
      anchor: "AbleBaker",
      nextIndex: 5,
    });
    expect(pool.allocate(6)).toEqual({
      anchor: "BakerAble",
      nextIndex: 7,
    });
    expect(pool.allocate(-1).anchor).toBe("Able");
    expect(() => pool.allocate(pool.maxAllocations)).toThrow(
      "Anchor pool exhausted",
    );
  });
});
