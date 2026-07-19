import type {
  ProviderAuthCatalog,
  ProviderAuthCatalogEntry,
} from "@uix/api/agent-channels";

type AuthMethod = ProviderAuthCatalogEntry["methods"][number];
type CredentialMethod = Extract<AuthMethod, { type: "credentials" }>;
type MethodConnection = NonNullable<AuthMethod["connection"]>;

interface OAuthStartActionRecipe {
  id: string;
  label: string;
  primary: boolean;
  /** Pre-answer the provider's first matching onSelect callback. */
  initialSelection?: string;
}

interface ProviderSetupRecipe {
  displayName?: string;
  /** Combines this backend provider into another presentation row. */
  mergeInto?: string;
  /** Model providers offer generic API-key setup unless explicitly disabled. */
  api?: false;
  oauthStartActions?: readonly OAuthStartActionRecipe[];
}

const providerSetupRecipes: Record<string, ProviderSetupRecipe> = {
  anthropic: {
    displayName: "Anthropic (Claude)",
    oauthStartActions: [
      { id: "browser", label: "Sign in with browser", primary: true },
    ],
  },
  "github-copilot": {
    oauthStartActions: [
      { id: "device-code", label: "Sign in with GitHub", primary: true },
    ],
  },
  openai: { displayName: "OpenAI (ChatGPT)" },
  // ChatGPT subscription tokens authenticate the Codex provider. Standard
  // OpenAI API keys belong to the separate `openai` model provider.
  "openai-codex": {
    api: false,
    mergeInto: "openai",
    oauthStartActions: [
      {
        id: "browser",
        label: "Browser login",
        primary: true,
        initialSelection: "browser",
      },
      {
        id: "device-code",
        label: "Device code login",
        primary: false,
        initialSelection: "device_code",
      },
    ],
  },
};

const defaultOAuthStartActions: readonly OAuthStartActionRecipe[] = [
  { id: "sign-in", label: "Sign in", primary: true },
];

interface ProviderAuthStatus {
  configured: boolean;
  source?: string;
  label?: string;
}

interface ProviderRegistry {
  getAll(): Array<{ provider: string }>;
  getProviderDisplayName(providerId: string): string;
  getProviderAuthStatus(providerId: string): ProviderAuthStatus;
  authStorage: {
    getOAuthProviders(): Array<{ id: string; name: string }>;
    getAuthStatus(providerId: string): ProviderAuthStatus;
    get(
      providerId: string,
    ): { type: "oauth" } | { type: "api_key"; key?: string } | undefined;
  };
}

/**
 * Derive one renderer-facing provider-auth catalog from Pi's model and OAuth provider
 * registries. Model providers receive the generic API-key form unless a
 * setup recipe replaces it; OAuth-only extension providers remain discoverable
 * without inventing a model entry.
 */
export function deriveProviderAuthCatalogForEnvironment(
  registry: ProviderRegistry,
  environment: Readonly<Record<string, string | undefined>> = {},
): ProviderAuthCatalog {
  const providers = new Map<string, ProviderAuthCatalogEntry>();
  const modelProviderIds = new Set(
    registry.getAll().map((model) => model.provider),
  );

  for (const id of modelProviderIds) {
    const recipe = providerSetupRecipes[id];
    const provider = getOrCreateProviderAuthCatalogEntry(
      providers,
      id,
      registry.getProviderDisplayName(id),
    );
    if (recipe?.api === false) continue;
    provider.methods.push(
      deriveGenericApiKeyMethod(
        id,
        toMethodConnection(
          registry,
          id,
          registry.getProviderAuthStatus(id),
          "api_key",
          environment,
        ),
      ),
    );
  }

  for (const oauth of registry.authStorage.getOAuthProviders()) {
    const provider = getOrCreateProviderAuthCatalogEntry(
      providers,
      oauth.id,
      oauth.name,
    );
    const currentConnection = toMethodConnection(
      registry,
      oauth.id,
      registry.authStorage.getAuthStatus(oauth.id),
      "oauth",
      environment,
    );
    provider.methods.unshift({
      id: "oauth",
      type: "oauth",
      providerId: oauth.id,
      label: "Subscription",
      startActions: oauthStartActions(oauth.id).map(
        ({ id, label, primary }) => ({ id, label, primary }),
      ),
      ...(currentConnection && { connection: currentConnection }),
    });
  }

  return [...providers.values()].sort((a, b) => {
    const rank = toProviderRank(a) - toProviderRank(b);
    return rank || a.name.localeCompare(b.name);
  });
}

export function resolveOAuthStartAction(
  providerId: string,
  actionId: string,
): { initialSelection?: string } | undefined {
  const action = oauthStartActions(providerId).find(
    (candidate) => candidate.id === actionId,
  );
  if (!action) return undefined;
  return action.initialSelection === undefined
    ? {}
    : { initialSelection: action.initialSelection };
}

/** Resolve only credential methods present in the catalog offered to surfaces. */
export function findOfferedCredentialMethod(
  registry: ProviderRegistry,
  providerId: string,
  methodId: string,
): CredentialMethod | undefined {
  for (const provider of deriveProviderAuthCatalogForEnvironment(registry)) {
    const method = provider.methods.find(
      (candidate) =>
        candidate.providerId === providerId && candidate.id === methodId,
    );
    if (method?.type === "credentials") return method;
  }
  return undefined;
}

function oauthStartActions(
  providerId: string,
): readonly OAuthStartActionRecipe[] {
  return (
    providerSetupRecipes[providerId]?.oauthStartActions ??
    defaultOAuthStartActions
  );
}

function getOrCreateProviderAuthCatalogEntry(
  providers: Map<string, ProviderAuthCatalogEntry>,
  backendId: string,
  fallbackName: string,
): ProviderAuthCatalogEntry {
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

function deriveGenericApiKeyMethod(
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

function toProviderRank(provider: ProviderAuthCatalogEntry): number {
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
  environment: Readonly<Record<string, string | undefined>>,
): MethodConnection | undefined {
  if (!status.configured && status.source === undefined) return undefined;
  const credential = registry.authStorage.get(providerId);
  if (credential && credential.type !== credentialType) return undefined;
  if (!credential && credentialType === "oauth") return undefined;
  const storedEnvironmentName =
    credential?.type === "api_key"
      ? toEnvironmentName(credential.key)
      : undefined;
  const credentialReference = storedEnvironmentName
    ? ({ type: "environment", name: storedEnvironmentName } as const)
    : credential?.type === "api_key" && credential.key?.startsWith("!")
      ? ({ type: "command", location: "auth_file" } as const)
      : status.source === "environment" && status.label
        ? ({ type: "environment", name: status.label } as const)
        : status.source === "models_json_command"
          ? ({
              type: "command",
              location: "provider_configuration",
            } as const)
          : undefined;
  const environmentValue =
    credentialReference?.type === "environment" &&
    isEnvironmentName(credentialReference.name)
      ? environment[credentialReference.name]
      : undefined;
  const keySuffix =
    credentialType === "api_key"
      ? (toSafeKeySuffix(environmentValue) ??
        (credential?.type === "api_key"
          ? toSafeKeySuffix(credential.key)
          : undefined))
      : undefined;
  return {
    source:
      status.source === "stored" ||
      status.source === "environment" ||
      status.source === "runtime"
        ? status.source
        : "configuration",
    ...(credentialReference && { credentialReference }),
    ...(keySuffix && { keySuffix }),
  };
}

function toSafeKeySuffix(key: string | undefined): string | undefined {
  // Config expressions may name environment variables or execute commands;
  // neither their source nor resolved output is display metadata. Restrict
  // hints to ordinary literal keys with an unremarkable four-character tail.
  if (!key || key.length < 8 || key.startsWith("!") || key.includes("$")) {
    return undefined;
  }
  const suffix = key.slice(-4);
  return /^[\x21-\x7e]{4}$/.test(suffix) ? suffix : undefined;
}

function toEnvironmentName(key: string | undefined): string | undefined {
  if (!key) return undefined;
  const match =
    /^\$(?:([a-zA-Z_][a-zA-Z0-9_]*)|\{([a-zA-Z_][a-zA-Z0-9_]*)\})$/.exec(key);
  return match?.[1] ?? match?.[2];
}

function isEnvironmentName(value: string): boolean {
  return /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(value);
}
