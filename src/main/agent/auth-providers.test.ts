import { describe, expect, it } from "vitest";

import {
  findOfferedCredentialMethod,
  listAuthProviders,
  resolveOAuthStartAction,
} from "./auth-providers";

function registry() {
  const statuses: Record<
    string,
    { configured: boolean; source?: string; label?: string }
  > = {
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
      get: (id: string): { type: "api_key"; key: string } | undefined =>
        id === "anthropic"
          ? { type: "api_key", key: "sk-ant-secret-a1b2" }
          : undefined,
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
        startActions: [
          { id: "browser", label: "Sign in with browser", primary: true },
        ],
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
          startActions: [
            { id: "browser", label: "Browser login", primary: true },
            {
              id: "device-code",
              label: "Device code login",
              primary: false,
            },
          ],
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

  it("resolves catalog action ids to provider runtime selections", () => {
    expect(resolveOAuthStartAction("openai-codex", "browser")).toEqual({
      initialSelection: "browser",
    });
    expect(resolveOAuthStartAction("openai-codex", "device-code")).toEqual({
      initialSelection: "device_code",
    });
    expect(resolveOAuthStartAction("github-copilot", "device-code")).toEqual(
      {},
    );
    expect(resolveOAuthStartAction("custom", "sign-in")).toEqual({});
    expect(resolveOAuthStartAction("openai-codex", "missing")).toBeUndefined();
  });

  it("treats externally sourced auth as connected", () => {
    const value = registry();
    value.getProviderAuthStatus = () => ({
      configured: false,
      source: "environment",
      label: "OPENROUTER_API_KEY",
    });

    expect(
      listAuthProviders(value, {
        OPENROUTER_API_KEY: "sk-or-secret-z9y8",
      })
        .find(({ id }) => id === "openrouter")
        ?.methods.find(({ type }) => type === "credentials")?.connection,
    ).toEqual({
      source: "environment",
      credentialReference: {
        type: "environment",
        name: "OPENROUTER_API_KEY",
      },
      keySuffix: "z9y8",
    });
  });

  it("exposes only a safe suffix for stored literal API keys", () => {
    const value = registry();
    const apiConnection = (
      environment: Readonly<Record<string, string | undefined>> = {},
    ) =>
      listAuthProviders(value, environment)
        .find(({ id }) => id === "anthropic")
        ?.methods.find(({ type }) => type === "credentials")?.connection;

    expect(apiConnection()).toEqual({
      source: "stored",
      keySuffix: "a1b2",
    });

    value.authStorage.get = () => ({
      type: "api_key",
      key: "$ANTHROPIC_API_KEY",
    });
    expect(
      apiConnection({ ANTHROPIC_API_KEY: "sk-ant-from-env-c3d4" }),
    ).toEqual({
      source: "stored",
      credentialReference: {
        type: "environment",
        name: "ANTHROPIC_API_KEY",
      },
      keySuffix: "c3d4",
    });

    value.authStorage.get = () => ({
      type: "api_key",
      key: "!op read 'op://vault/anthropic/key'",
    });
    expect(apiConnection()).toEqual({
      source: "stored",
      credentialReference: { type: "command", location: "auth_file" },
    });

    value.authStorage.get = () => ({
      type: "api_key",
      key: "sk-ant-secret-ab==",
    });
    expect(apiConnection()).toEqual({ source: "stored", keySuffix: "ab==" });

    value.authStorage.get = () => ({ type: "api_key", key: "short" });
    expect(apiConnection()).toEqual({ source: "stored" });

    value.authStorage.get = () => undefined;
    value.getProviderAuthStatus = () => ({
      configured: true,
      source: "models_json_command",
    });
    expect(apiConnection()).toEqual({
      source: "configuration",
      credentialReference: {
        type: "command",
        location: "provider_configuration",
      },
    });
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
