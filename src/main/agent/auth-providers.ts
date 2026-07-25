import type {
  ProviderAuthCatalog,
  ProviderAuthCatalogEntry,
  ProviderAuthMethod,
  ProviderAuthType,
} from "@uix/api/agent-channels";

type ProviderConnection = NonNullable<ProviderAuthMethod["connection"]>;

interface ProviderAuthStatus {
  configured: boolean;
  source?: string;
  label?: string;
}

interface ProviderAuthRuntime {
  getProviders(): readonly {
    id: string;
    name: string;
    auth: {
      apiKey?: { login?: unknown };
      oauth?: { login?: unknown };
    };
  }[];
  getProviderAuthStatus(providerId: string): ProviderAuthStatus;
  isUsingOAuth(providerId: string): boolean;
}

/** Derive the provider-auth catalog from Pi's interactive login methods. */
export function deriveProviderAuthCatalog(
  runtime: ProviderAuthRuntime,
): ProviderAuthCatalog {
  return runtime
    .getProviders()
    .map((provider): ProviderAuthCatalogEntry => {
      const status = runtime.getProviderAuthStatus(provider.id);
      const usingOAuth = runtime.isUsingOAuth(provider.id);
      const methods: ProviderAuthMethod[] = [];

      if (typeof provider.auth.apiKey?.login === "function") {
        const connection = toMethodConnection(status, "api_key", usingOAuth);
        methods.push({
          providerId: provider.id,
          authType: "api_key",
          ...(connection && { connection }),
        });
      }

      if (typeof provider.auth.oauth?.login === "function") {
        const connection = toMethodConnection(status, "oauth", usingOAuth);
        methods.push({
          providerId: provider.id,
          authType: "oauth",
          ...(connection && { connection }),
        });
      }

      return { id: provider.id, name: provider.name, methods };
    })
    .filter((provider) => provider.methods.length > 0)
    .sort((a, b) => {
      const connectedRank =
        Number(!hasConnection(a)) - Number(!hasConnection(b));
      return connectedRank || a.name.localeCompare(b.name);
    });
}

function hasConnection(provider: ProviderAuthCatalogEntry): boolean {
  return provider.methods.some((method) => method.connection !== undefined);
}

function toMethodConnection(
  status: ProviderAuthStatus,
  authType: ProviderAuthType,
  usingOAuth: boolean,
): ProviderConnection | undefined {
  if (!status.configured && status.source === undefined) return undefined;
  if (usingOAuth !== (authType === "oauth")) return undefined;

  return {
    source:
      status.source === "stored" ||
      status.source === "environment" ||
      status.source === "runtime"
        ? status.source
        : "configuration",
    ...(status.label && { label: status.label }),
  };
}
