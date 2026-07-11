import type { AuthProvider } from "@uix/api/agent-channels";

type AuthMethod = AuthProvider["methods"][number];
type CredentialMethod = Extract<AuthMethod, { type: "credentials" }>;
type MethodConnection = NonNullable<AuthMethod["connection"]>;

interface ProviderSetupRecipe {
  displayName?: string;
  /** Combines this backend provider into another presentation row. */
  mergeInto?: string;
  /** Model providers offer generic API-key setup unless explicitly disabled. */
  api?: false;
}

const providerSetupRecipes: Record<string, ProviderSetupRecipe> = {
  anthropic: { displayName: "Anthropic (Claude)" },
  openai: { displayName: "OpenAI (ChatGPT)" },
  // ChatGPT subscription tokens authenticate the Codex provider. Standard
  // OpenAI API keys belong to the separate `openai` model provider.
  "openai-codex": { api: false, mergeInto: "openai" },
};

interface ProviderAuthStatus {
  configured: boolean;
  source?: string;
}

interface ProviderRegistry {
  getAll(): Array<{ provider: string }>;
  getProviderDisplayName(providerId: string): string;
  getProviderAuthStatus(providerId: string): ProviderAuthStatus;
  authStorage: {
    getOAuthProviders(): Array<{ id: string; name: string }>;
    getAuthStatus(providerId: string): ProviderAuthStatus;
    get(providerId: string): { type: "oauth" | "api_key" } | undefined;
  };
}

/**
 * Build one renderer-facing auth catalog from Pi's model and OAuth provider
 * registries. Model providers receive the generic API-key form unless a
 * setup recipe replaces it; OAuth-only extension providers remain discoverable
 * without inventing a model entry.
 */
export function listAuthProviders(registry: ProviderRegistry): AuthProvider[] {
  const providers = new Map<string, AuthProvider>();
  const modelProviderIds = new Set(
    registry.getAll().map((model) => model.provider),
  );

  for (const id of modelProviderIds) {
    const recipe = providerSetupRecipes[id];
    const provider = getOrCreateAuthProvider(
      providers,
      id,
      registry.getProviderDisplayName(id),
    );
    if (recipe?.api === false) continue;
    provider.methods.push(
      createGenericApiKeyMethod(
        id,
        toMethodConnection(
          registry,
          id,
          registry.getProviderAuthStatus(id),
          "api_key",
        ),
      ),
    );
  }

  for (const oauth of registry.authStorage.getOAuthProviders()) {
    const provider = getOrCreateAuthProvider(providers, oauth.id, oauth.name);
    const currentConnection = toMethodConnection(
      registry,
      oauth.id,
      registry.authStorage.getAuthStatus(oauth.id),
      "oauth",
    );
    provider.methods.unshift({
      id: "oauth",
      type: "oauth",
      providerId: oauth.id,
      label: "Subscription",
      ...(currentConnection && { connection: currentConnection }),
    });
  }

  return [...providers.values()].sort((a, b) => {
    const rank = toProviderRank(a) - toProviderRank(b);
    return rank || a.name.localeCompare(b.name);
  });
}

/** Resolve only credential methods present in the catalog offered to surfaces. */
export function findOfferedCredentialMethod(
  registry: ProviderRegistry,
  providerId: string,
  methodId: string,
): CredentialMethod | undefined {
  for (const provider of listAuthProviders(registry)) {
    const method = provider.methods.find(
      (candidate) =>
        candidate.providerId === providerId && candidate.id === methodId,
    );
    if (method?.type === "credentials") return method;
  }
  return undefined;
}

function getOrCreateAuthProvider(
  providers: Map<string, AuthProvider>,
  backendId: string,
  fallbackName: string,
): AuthProvider {
  const recipe = providerSetupRecipes[backendId];
  const id = recipe?.mergeInto ?? backendId;
  const existing = providers.get(id);
  if (existing) return existing;

  const provider = {
    id,
    name:
      providerSetupRecipes[id]?.displayName ??
      recipe?.displayName ??
      fallbackName,
    methods: [],
  };
  providers.set(id, provider);
  return provider;
}

function createGenericApiKeyMethod(
  providerId: string,
  connection: MethodConnection | undefined,
): CredentialMethod {
  return {
    id: "api-key",
    type: "credentials",
    providerId,
    label: "API",
    ...(connection && { connection }),
    fields: [
      {
        id: "apiKey",
        label: "API key",
        secret: true,
        required: true,
      },
    ],
  };
}

function toProviderRank(provider: AuthProvider): number {
  const connected = provider.methods.some((method) => method.connection);
  const category = provider.methods.some((method) => method.type === "oauth")
    ? 0
    : provider.id === "openrouter"
      ? 1
      : 2;
  return (connected ? 0 : 3) + category;
}

function toMethodConnection(
  registry: ProviderRegistry,
  providerId: string,
  status: ProviderAuthStatus,
  credentialType: "oauth" | "api_key",
): MethodConnection | undefined {
  if (!status.configured && status.source === undefined) return undefined;
  const credential = registry.authStorage.get(providerId);
  if (credential && credential.type !== credentialType) return undefined;
  if (!credential && credentialType === "oauth") return undefined;
  return {
    source:
      status.source === "stored" ||
      status.source === "environment" ||
      status.source === "runtime"
        ? status.source
        : "configuration",
  };
}
