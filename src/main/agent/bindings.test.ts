import { describe, expect, it } from "vitest";

import type { ToolDefinition } from "@earendil-works/pi-coding-agent";

import {
  collectAgentBindingContext,
  collectAgentBindingTools,
} from "./bindings";

describe("collectAgentBindingTools", () => {
  it("throws on a duplicate tool name across bindings", () => {
    const tool = { name: "dup" } as unknown as ToolDefinition;
    expect(() =>
      collectAgentBindingTools([{ tools: [tool] }, { tools: [tool] }]),
    ).toThrow(/Duplicate/);
  });
});

describe("collectAgentBindingContext", () => {
  it("joins contributed blocks in binding order", async () => {
    const context = await collectAgentBindingContext([
      { contextForTurn: () => Promise.resolve("first") },
      { contextForTurn: () => Promise.resolve(null) },
      { contextForTurn: () => Promise.resolve("second") },
    ]);
    expect(context).toBe("first\n\nsecond");
  });

  it("returns null when nothing contributes", async () => {
    expect(
      await collectAgentBindingContext([
        {},
        { contextForTurn: () => Promise.resolve(null) },
      ]),
    ).toBeNull();
  });
});
