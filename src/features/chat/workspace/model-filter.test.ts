import { describe, expect, it } from "vitest";

import type { ModelOption } from "@uix/api/agent-channels";

import { filterModels } from "./model-filter";

const models: ModelOption[] = [
  { provider: "anthropic", id: "claude-sonnet-4-5", name: "Claude Sonnet 4.5" },
  { provider: "anthropic", id: "claude-opus-4-1", name: "Claude Opus 4.1" },
  { provider: "openai", id: "gpt-5", name: "GPT-5" },
];

describe("filterModels", () => {
  it("keeps every model on a blank or whitespace-only query", () => {
    expect(filterModels(models, "")).toEqual(models);
    expect(filterModels(models, "   ")).toEqual(models);
  });

  it("matches provider, id, and display name", () => {
    expect(filterModels(models, "openai")).toEqual([models[2]]);
    expect(filterModels(models, "opus-4-1")).toEqual([models[1]]);
    expect(filterModels(models, "Sonnet 4.5")).toEqual([models[0]]);
  });

  it("is case-insensitive and trims the query", () => {
    expect(filterModels(models, "  ANTHROPIC ")).toEqual([
      models[0],
      models[1],
    ]);
    expect(filterModels(models, "gPt")).toEqual([models[2]]);
  });

  it("returns empty on no match", () => {
    expect(filterModels(models, "gemini")).toEqual([]);
  });
});
