import { describe, expect, it } from "vitest";

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

import { type AgentFacet, createUixCoreExtension } from "./facets";

const pi = {} as ExtensionAPI;

describe("createUixCoreExtension", () => {
  it("runs facets in list order, each handed the same pi", async () => {
    const seen: string[] = [];
    const facet =
      (id: string): AgentFacet =>
      (handle) => {
        expect(handle).toBe(pi);
        seen.push(id);
      };
    await createUixCoreExtension([facet("a"), facet("b"), facet("c")])(pi);
    expect(seen).toEqual(["a", "b", "c"]);
  });

  it("awaits an async facet before running the next", async () => {
    const seen: string[] = [];
    const slow: AgentFacet = async () => {
      await Promise.resolve();
      seen.push("slow");
    };
    const fast: AgentFacet = () => {
      seen.push("fast");
    };
    await createUixCoreExtension([slow, fast])(pi);
    expect(seen).toEqual(["slow", "fast"]);
  });
});
