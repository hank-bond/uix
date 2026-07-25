import { describe, expect, it } from "vitest";

import type { ProviderAuthCatalog } from "@uix/api/agent-channels";

import { deriveProviderAuthRows } from "./provider-auth-presentation";

describe("provider auth rows", () => {
  it("groups OpenAI identities while preserving method provider ids", () => {
    const catalog: ProviderAuthCatalog = [
      {
        id: "openai-codex",
        name: "OpenAI Codex",
        methods: [{ providerId: "openai-codex", authType: "oauth" }],
      },
      {
        id: "anthropic",
        name: "Anthropic",
        methods: [{ providerId: "anthropic", authType: "api_key" }],
      },
      {
        id: "openai",
        name: "OpenAI",
        methods: [{ providerId: "openai", authType: "api_key" }],
      },
    ];

    expect(deriveProviderAuthRows(catalog)).toEqual([
      {
        id: "openai",
        name: "OpenAI",
        methods: [
          { providerId: "openai", authType: "api_key" },
          { providerId: "openai-codex", authType: "oauth" },
        ],
      },
      {
        id: "anthropic",
        name: "Anthropic",
        methods: [{ providerId: "anthropic", authType: "api_key" }],
      },
    ]);
  });

  it("leaves unrelated catalogs unchanged", () => {
    const catalog: ProviderAuthCatalog = [
      {
        id: "anthropic",
        name: "Anthropic",
        methods: [{ providerId: "anthropic", authType: "oauth" }],
      },
    ];

    expect(deriveProviderAuthRows(catalog)).toEqual(catalog);
  });
});
