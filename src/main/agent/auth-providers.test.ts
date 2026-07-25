import { describe, expect, it } from "vitest";

import { deriveProviderAuthCatalog } from "./auth-providers";

interface FakeProvider {
  id: string;
  name: string;
  auth: {
    apiKey?: { login?: () => void };
    oauth?: { login?: () => void };
  };
}

function createHarness() {
  const statuses: Record<
    string,
    { configured: boolean; source?: string; label?: string }
  > = {
    anthropic: { configured: true, source: "stored" },
    openai: { configured: false },
    "openai-codex": { configured: true, source: "stored" },
  };
  const oauth = new Set(["openai-codex"]);
  const providers: FakeProvider[] = [
    {
      id: "openai",
      name: "OpenAI",
      auth: { apiKey: { login: () => {} } },
    },
    {
      id: "openai-codex",
      name: "OpenAI Codex",
      auth: { oauth: { login: () => {} } },
    },
    {
      id: "anthropic",
      name: "Anthropic",
      auth: {
        apiKey: { login: () => {} },
        oauth: { login: () => {} },
      },
    },
  ];
  return {
    statuses,
    oauth,
    providers,
    runtime: {
      getProviders: () => providers,
      getProviderAuthStatus: (id: string) =>
        statuses[id] ?? { configured: false },
      isUsingOAuth: (id: string) => oauth.has(id),
    },
  };
}

describe("provider auth catalog", () => {
  it("projects Pi providers and their interactive auth methods", () => {
    const value = createHarness();

    expect(deriveProviderAuthCatalog(value.runtime)).toEqual([
      {
        id: "anthropic",
        name: "Anthropic",
        methods: [
          {
            providerId: "anthropic",
            authType: "api_key",
            connection: { source: "stored" },
          },
          {
            providerId: "anthropic",
            authType: "oauth",
          },
        ],
      },
      {
        id: "openai-codex",
        name: "OpenAI Codex",
        methods: [
          {
            providerId: "openai-codex",
            authType: "oauth",
            connection: { source: "stored" },
          },
        ],
      },
      {
        id: "openai",
        name: "OpenAI",
        methods: [
          {
            providerId: "openai",
            authType: "api_key",
          },
        ],
      },
    ]);
  });

  it("associates one provider connection with only its active auth type", () => {
    const value = createHarness();
    value.oauth.add("anthropic");

    expect(
      deriveProviderAuthCatalog(value.runtime).find(
        (provider) => provider.id === "anthropic",
      )?.methods,
    ).toEqual([
      {
        providerId: "anthropic",
        authType: "api_key",
      },
      {
        providerId: "anthropic",
        authType: "oauth",
        connection: { source: "stored" },
      },
    ]);
  });

  it("preserves Pi's non-secret connection source label", () => {
    const value = createHarness();
    value.statuses.openai = {
      configured: true,
      source: "environment",
      label: "OPENAI_API_KEY",
    };

    expect(
      deriveProviderAuthCatalog(value.runtime).find(
        (provider) => provider.id === "openai",
      )?.methods[0]?.connection,
    ).toEqual({ source: "environment", label: "OPENAI_API_KEY" });
  });

  it("omits providers and methods without interactive login", () => {
    const value = createHarness();
    value.providers.push({
      id: "ambient-only",
      name: "Ambient only",
      auth: { apiKey: {} },
    });
    value.providers.push({
      id: "mixed",
      name: "Mixed",
      auth: { apiKey: {}, oauth: { login: () => {} } },
    });

    const catalog = deriveProviderAuthCatalog(value.runtime);
    expect(catalog.some((provider) => provider.id === "ambient-only")).toBe(
      false,
    );
    expect(
      catalog.find((provider) => provider.id === "mixed")?.methods,
    ).toEqual([{ providerId: "mixed", authType: "oauth" }]);
  });
});
