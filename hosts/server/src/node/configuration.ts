// Defines the server deployment configuration and its environment contract.

import { isIP } from "node:net";
import { resolve } from "node:path";

import { Type } from "typebox";
import { Value } from "typebox/value";

import { normalizePublicOrigin } from "./public-origin";

const DeploymentProfiles = ["loopback", "trusted-network", "tls"] as const;

export type ServerDeploymentProfile = (typeof DeploymentProfiles)[number];

const ServerEnvironmentSchema = Type.Object(
  {
    UIX_SERVER_PROFILE: Type.Optional(
      Type.Union(
        DeploymentProfiles.map((profile) => Type.Literal(profile)),
        {
          title: "PROFILE",
          description:
            "Deployment profile: loopback, trusted-network plaintext, or browser-visible TLS.",
          default: "loopback",
        },
      ),
    ),
    UIX_SERVER_HOST: Type.Optional(
      Type.String({
        title: "HOST",
        description:
          "Private listener address; non-loopback values require an explicit deployment profile and public origin.",
        default: "127.0.0.1",
        minLength: 1,
      }),
    ),
    UIX_SERVER_PORT: Type.Optional(
      Type.String({
        title: "PORT",
        description: "Private listener port.",
        default: "3000",
        minLength: 1,
      }),
    ),
    UIX_SERVER_REGISTRY: Type.Optional(
      Type.String({
        title: "PATH",
        description:
          "Server workspace registry; relative paths resolve from the process working directory.",
        default: "server.workspaces.json",
        minLength: 1,
      }),
    ),
    UIX_SERVER_DATA_DIR: Type.Optional(
      Type.String({
        title: "PATH",
        description:
          "Server-owned application data; relative paths resolve from the process working directory.",
        default: ".uix-server",
        minLength: 1,
      }),
    ),
    UIX_PUBLIC_ORIGIN: Type.Optional(
      Type.String({
        title: "ORIGIN",
        description:
          "Browser-visible HTTP(S) origin; defaults to the loopback listener origin.",
        minLength: 1,
      }),
    ),
  },
  { additionalProperties: false },
);

const ServerEnvironmentSchemaText = JSON.stringify(ServerEnvironmentSchema);

type ServerEnvironmentName = keyof typeof ServerEnvironmentSchema.properties;

interface EnvironmentPropertyMetadata {
  readonly title?: unknown;
  readonly description?: unknown;
  readonly default?: unknown;
}

interface ServerEnvironment {
  readonly UIX_SERVER_PROFILE?: ServerDeploymentProfile;
  readonly UIX_SERVER_HOST?: string;
  readonly UIX_SERVER_PORT?: string;
  readonly UIX_SERVER_REGISTRY?: string;
  readonly UIX_SERVER_DATA_DIR?: string;
  readonly UIX_PUBLIC_ORIGIN?: string;
}

interface ResolveServerConfigurationOptions {
  readonly environment: Readonly<Record<string, string | undefined>>;
  readonly cwd: string;
}

export interface ServerConfiguration {
  readonly profile: ServerDeploymentProfile;
  readonly hostAddress: string;
  readonly port: number;
  readonly registryPath: string;
  readonly piAppDataDir: string;
  readonly publicOrigin: string;
}

/** Accept the server's intentionally small command-line surface. */
export function parseServerArguments(
  arguments_: readonly string[],
): "help" | "start" {
  if (arguments_.length === 0) return "start";
  if (
    arguments_.length === 1 &&
    (arguments_[0] === "--help" || arguments_[0] === "-h")
  ) {
    return "help";
  }
  throw new Error(`Unknown server argument: ${arguments_.join(" ")}`);
}

/** Resolve the declared server variables into canonical process configuration. */
export function resolveServerConfiguration(
  options: ResolveServerConfigurationOptions,
): ServerConfiguration {
  const environment = parseServerEnvironment(options.environment);
  const profile = environment.UIX_SERVER_PROFILE ?? "loopback";
  const hostAddress = environment.UIX_SERVER_HOST ?? "127.0.0.1";
  const port = parsePort(environment.UIX_SERVER_PORT ?? "3000");
  const registryPath = resolve(
    options.cwd,
    environment.UIX_SERVER_REGISTRY ?? "server.workspaces.json",
  );
  const piAppDataDir = resolve(
    options.cwd,
    environment.UIX_SERVER_DATA_DIR ?? ".uix-server",
    "pi",
  );
  const declaredPublicOrigin = environment.UIX_PUBLIC_ORIGIN;
  const publicOrigin = normalizePublicOrigin(
    declaredPublicOrigin ?? `http://${toUrlHost(hostAddress)}:${String(port)}`,
  );
  assertDeploymentProfile({
    profile,
    hostAddress,
    publicOrigin,
    hasDeclaredPublicOrigin: declaredPublicOrigin !== undefined,
  });
  return {
    profile,
    hostAddress,
    port,
    registryPath,
    piAppDataDir,
    publicOrigin,
  };
}

/** Render command help from the same schema metadata used for validation. */
export function renderServerHelp(): string {
  const properties = Object.entries(
    ServerEnvironmentSchema.properties,
  ) as Array<[string, EnvironmentPropertyMetadata]>;
  const labels = properties.map(([name, schema]) =>
    formatEnvironmentLabel(name, schema.title),
  );
  const width = Math.max(...labels.map((label) => label.length));
  const rows = properties.map(([name, schema], index) => {
    const description = requireEnvironmentMetadata(
      name,
      "description",
      schema.description,
    );
    const defaultText =
      typeof schema.default === "string" ? ` Default: ${schema.default}.` : "";
    return `  ${labels[index]?.padEnd(width)}  ${description}${defaultText}`;
  });
  return [
    "Usage: npm run start:server [-- --help]",
    "",
    "Environment:",
    ...rows,
    "",
  ].join("\n");
}

function parseServerEnvironment(
  source: Readonly<Record<string, string | undefined>>,
): ServerEnvironment {
  const candidate: Partial<Record<ServerEnvironmentName, string>> = {};
  for (const name of Object.keys(
    ServerEnvironmentSchema.properties,
  ) as ServerEnvironmentName[]) {
    const value = source[name];
    if (value !== undefined) candidate[name] = value;
  }
  try {
    return Value.Parse(ServerEnvironmentSchema, candidate);
  } catch (error) {
    throw new Error(
      `Invalid server environment configuration. Schema: ${ServerEnvironmentSchemaText}`,
      { cause: error },
    );
  }
}

function assertDeploymentProfile(options: {
  readonly profile: ServerDeploymentProfile;
  readonly hostAddress: string;
  readonly publicOrigin: string;
  readonly hasDeclaredPublicOrigin: boolean;
}): void {
  const publicUrl = new URL(options.publicOrigin);
  if (options.profile === "loopback") {
    if (!isLoopbackHost(options.hostAddress)) {
      throw new Error(
        "Non-loopback binding requires UIX_SERVER_PROFILE and UIX_PUBLIC_ORIGIN",
      );
    }
    if (!isLoopbackHost(publicUrl.hostname)) {
      throw new Error(
        "The loopback profile requires a loopback UIX_PUBLIC_ORIGIN",
      );
    }
    return;
  }

  if (!options.hasDeclaredPublicOrigin) {
    throw new Error(
      `${options.profile} profile requires an explicit UIX_PUBLIC_ORIGIN`,
    );
  }
  if (options.profile === "trusted-network") {
    if (publicUrl.protocol !== "http:") {
      throw new Error(
        "The trusted-network profile requires a plaintext HTTP UIX_PUBLIC_ORIGIN",
      );
    }
    return;
  }
  if (publicUrl.protocol !== "https:") {
    throw new Error("The tls profile requires an HTTPS UIX_PUBLIC_ORIGIN");
  }
}

function isLoopbackHost(host: string): boolean {
  const normalized = host.toLowerCase().replace(/^\[|\]$/g, "");
  if (normalized === "localhost" || normalized === "::1") return true;
  if (isIP(normalized) !== 4) return false;
  const firstOctet = Number(normalized.split(".")[0]);
  return firstOctet === 127;
}

function toUrlHost(host: string): string {
  return isIP(host) === 6 ? `[${host}]` : host;
}

function parsePort(value: string): number {
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error(`Invalid UIX_SERVER_PORT: ${value}`);
  }
  return port;
}

function formatEnvironmentLabel(name: string, title: unknown): string {
  const valueName = requireEnvironmentMetadata(name, "title", title);
  return `${name}=<${valueName}>`;
}

function requireEnvironmentMetadata(
  name: string,
  field: "description" | "title",
  value: unknown,
): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Server environment schema ${name} is missing ${field}`);
  }
  return value;
}
