// Declares, validates, normalizes, and documents the server process environment contract.

import { resolve } from "node:path";

import { Type } from "typebox";
import { Value } from "typebox/value";

import { normalizePublicOrigin } from "./public-origin";

const ServerEnvironmentSchema = Type.Object(
  {
    UIX_SERVER_PORT: Type.Optional(
      Type.String({
        title: "PORT",
        description: "Private loopback listener port.",
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
  readonly UIX_SERVER_PORT?: string;
  readonly UIX_SERVER_REGISTRY?: string;
  readonly UIX_SERVER_DATA_DIR?: string;
  readonly UIX_PUBLIC_ORIGIN?: string;
}

interface ResolveServerConfigurationOptions {
  readonly environment: Readonly<Record<string, string | undefined>>;
  readonly cwd: string;
  readonly hostAddress: string;
}

export interface ServerConfiguration {
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

/** Parse only the declared server variables and normalize their process-facing values. */
export function resolveServerConfiguration(
  options: ResolveServerConfigurationOptions,
): ServerConfiguration {
  const environment = parseServerEnvironment(options.environment);
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
  const publicOrigin = normalizePublicOrigin(
    environment.UIX_PUBLIC_ORIGIN ??
      `http://${options.hostAddress}:${String(port)}`,
  );
  return { port, registryPath, piAppDataDir, publicOrigin };
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
