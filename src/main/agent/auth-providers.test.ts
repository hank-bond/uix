import { describe, expect, it } from "vitest";

import {
  findOfferedCredentialMethod,
  listAuthProviders,
} from "./auth-providers";

function registry() {
  const statuses: Record<string, { configured: boolean; source?: string }> = {
    anthropic: { configured: true, source: "stored" },
    openrouter: { configured: false },
    copilot: { configured: false },
  };
  return {
    getAll: () => [
      { provider: "openrouter" },
      { provider: "openrouter" },
      { provider: "anthropic" },
    ],
    getProviderDisplayName: (id: string) =>
      ({ anthropic: "Anthropic", openrouter: "OpenRouter" })[id] ?? id,
    getProviderAuthStatus: (id: string) =>
      statuses[id] ?? { configured: false },
    authStorage: {
      getOAuthProviders: () => [
        { id: "anthropic", name: "Anthropic Subscription" },
        { id: "copilot", name: "GitHub Copilot" },
      ],
      getAuthStatus: (id: string) => statuses[id] ?? { configured: false },
      get: (id: string) =>
        id === "anthropic" ? ({ type: "api_key" } as const) : undefined,
    },
  };
}

describe("auth provider discovery", () => {
  it("merges model and OAuth providers into one method catalog", () => {
    const providers = listAuthProviders(registry());

    expect(providers.map(({ id, name }) => ({ id, name }))).toEqual([
      { id: "anthropic", name: "Anthropic (Claude)" },
      { id: "copilot", name: "GitHub Copilot" },
      { id: "openrouter", name: "OpenRouter" },
    ]);
    expect(providers[0]?.methods).toMatchObject([
      {
        type: "oauth",
        providerId: "anthropic",
        label: "Subscription",
      },
      {
        type: "credentials",
        providerId: "anthropic",
        label: "API",
        connection: { source: "stored" },
      },
    ]);
    expect(providers[1]?.methods).toMatchObject([
      {
        type: "oauth",
        providerId: "copilot",
        label: "Subscription",
      },
    ]);
    expect(providers[2]?.methods).toMatchObject([
      {
        type: "credentials",
        providerId: "openrouter",
        label: "API",
      },
    ]);
  });

  it("applies subscription, OpenRouter, and alphabetical ordering within each connection group", () => {
    const value = registry();
    const getAll = value.getAll;
    const getProviderAuthStatus = value.getProviderAuthStatus;
    value.getAll = () => [
      ...getAll(),
      { provider: "acme" },
      { provider: "beta" },
    ];
    value.getProviderAuthStatus = (id) =>
      id === "openrouter" || id === "acme"
        ? { configured: false, source: "environment" }
        : getProviderAuthStatus(id);

    expect(listAuthProviders(value).map(({ id }) => id)).toEqual([
      // Connected: subscription, OpenRouter, then remaining alphabetical.
      "anthropic",
      "openrouter",
      "acme",
      // Not connected: subscription, OpenRouter (already connected), remaining.
      "copilot",
      "beta",
    ]);
  });

  it("combines OpenAI API and ChatGPT subscription authentication", () => {
    const value = registry();
    const getAll = value.getAll;
    const getOAuthProviders = value.authStorage.getOAuthProviders;
    value.getAll = () => [
      ...getAll(),
      { provider: "openai" },
      { provider: "openai-codex" },
    ];
    value.authStorage.getOAuthProviders = () => [
      ...getOAuthProviders(),
      { id: "openai-codex", name: "OpenAI (ChatGPT Plus/Pro)" },
    ];

    expect(
      listAuthProviders(value).find(({ id }) => id === "openai"),
    ).toMatchObject({
      id: "openai",
      name: "OpenAI (ChatGPT)",
      methods: [
        {
          id: "oauth",
          type: "oauth",
          providerId: "openai-codex",
          label: "Subscription",
        },
        {
          id: "api-key",
          type: "credentials",
          providerId: "openai",
          label: "API",
        },
      ],
    });
    expect(
      listAuthProviders(value).some(({ id }) => id === "openai-codex"),
    ).toBe(false);
  });

  it("treats externally sourced auth as connected", () => {
    const value = registry();
    value.getProviderAuthStatus = () => ({
      configured: false,
      source: "environment",
    });

    expect(
      listAuthProviders(value)
        .find(({ id }) => id === "openrouter")
        ?.methods.find(({ type }) => type === "credentials")?.connection,
    ).toEqual({ source: "environment" });
  });

  it("finds only credential methods currently offered by the catalog", () => {
    const value = registry();

    expect(
      findOfferedCredentialMethod(value, "openrouter", "api-key"),
    ).toMatchObject({
      type: "credentials",
      providerId: "openrouter",
      id: "api-key",
    });
    expect(
      findOfferedCredentialMethod(value, "copilot", "oauth"),
    ).toBeUndefined();
    expect(
      findOfferedCredentialMethod(value, "missing", "api-key"),
    ).toBeUndefined();
  });
});
