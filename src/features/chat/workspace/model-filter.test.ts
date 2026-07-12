import { describe, expect, it } from "vitest";

import type { ModelOption } from "@uix/api/agent-channels";

import {
  filterModels,
  getInitialModelScope,
  getModelsForScope,
  toModelSource,
} from "./model-filter";

const models: ModelOption[] = [
  {
    provider: "anthropic",
    id: "claude-sonnet-4-5",
    name: "Claude Sonnet 4.5",
    favorite: false,
  },
  {
    provider: "anthropic",
    id: "claude-opus-4-1",
    name: "Claude Opus 4.1",
    favorite: false,
  },
  { provider: "openai", id: "gpt-5", name: "GPT-5", favorite: false },
];

describe("model scopes", () => {
  it("opens favorites when favorites exist", () => {
    const favorited = models.map((model, index) => ({
      ...model,
      favorite: index === 1,
    }));
    expect(getInitialModelScope(favorited, "")).toBe("favorites");
    expect(getModelsForScope(favorited, "favorites")).toEqual([favorited[1]]);
  });

  it("opens all models without favorites or with a seeded search", () => {
    expect(getInitialModelScope(models, "")).toBe("all");
    expect(
      getInitialModelScope(
        models.map((model) => ({ ...model, favorite: true })),
        "openrouter",
      ),
    ).toBe("all");
    expect(getModelsForScope(models, "all")).toEqual(models);
  });
});

describe("toModelSource", () => {
  it("uses the provider for a model id without a path", () => {
    expect(toModelSource(models[0])).toBe("anthropic");
  });

  it("includes the model-id path before its final segment", () => {
    expect(
      toModelSource({
        provider: "openrouter",
        id: "anthropic/claude-opus-4.5",
        name: "Anthropic: Claude Opus 4.5",
        favorite: false,
      }),
    ).toBe("openrouter/anthropic");
  });

  it("preserves deeper source paths", () => {
    expect(
      toModelSource({
        provider: "gateway",
        id: "team/anthropic/claude-opus",
        name: "Claude Opus",
        favorite: false,
      }),
    ).toBe("gateway/team/anthropic");
  });
});

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
