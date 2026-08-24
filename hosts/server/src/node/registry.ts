// Loads the private workspace registry and resolves its manifest-backed entries without booting workspace runtimes.

import { readFile } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";

import { Type } from "typebox";
import { Value } from "typebox/value";

import { assertWorkspaceCatalogId } from "@uix/host/catalog";
import { WorkspaceManifestFileName } from "@uix/runtime/features/manifest";
import { resolveWorkspace, type Workspace } from "@uix/runtime/roots";
import { toWorkspaceId, type WorkspaceId } from "@uix/runtime/workspace";

const WorkspaceRegistryFileSchema = Type.Object(
  {
    version: Type.Literal(1),
    workspaces: Type.Array(
      Type.Object(
        {
          id: Type.String({ minLength: 1 }),
          manifest: Type.String({ minLength: 1 }),
        },
        { additionalProperties: false },
      ),
    ),
  },
  { additionalProperties: false },
);

const WorkspaceNameSchema = Type.Object(
  { name: Type.String({ minLength: 1 }) },
  { additionalProperties: true },
);

const WorkspaceRegistryFileExample = JSON.stringify({
  version: 1,
  workspaces: [
    { id: "workspace-id", manifest: `./${WorkspaceManifestFileName}` },
  ],
});
const WorkspaceRegistryFileSchemaText = JSON.stringify(
  WorkspaceRegistryFileSchema,
);

interface WorkspaceRegistryFile {
  readonly version: 1;
  readonly workspaces: readonly WorkspaceRegistryFileEntry[];
}

interface WorkspaceRegistryFileEntry {
  readonly id: string;
  readonly manifest: string;
}

export interface RegisteredWorkspace {
  readonly id: WorkspaceId;
  readonly name: string;
  readonly workspace: Workspace;
}

export interface WorkspaceRegistry {
  list(): readonly RegisteredWorkspace[];
  require(workspaceId: string): RegisteredWorkspace;
}

class LoadedWorkspaceRegistry implements WorkspaceRegistry {
  readonly #entries: readonly RegisteredWorkspace[];
  readonly #entriesById: ReadonlyMap<string, RegisteredWorkspace>;

  constructor(entries: readonly RegisteredWorkspace[]) {
    this.#entries = entries;
    this.#entriesById = new Map(entries.map((entry) => [entry.id, entry]));
  }

  list(): readonly RegisteredWorkspace[] {
    return this.#entries;
  }

  require(workspaceId: string): RegisteredWorkspace {
    const entry = this.#entriesById.get(workspaceId);
    if (!entry) throw new Error(`Unknown workspace: ${workspaceId}`);
    return entry;
  }
}

/** Load and snapshot the registry and workspace names relative to the registry file. */
export async function loadWorkspaceRegistry(
  registryPath: string,
): Promise<WorkspaceRegistry> {
  const absoluteRegistryPath = resolve(registryPath);
  const parsed = await readJsonFile(absoluteRegistryPath, "workspace registry");
  let registry: WorkspaceRegistryFile;
  try {
    registry = Value.Parse(WorkspaceRegistryFileSchema, parsed);
  } catch (error) {
    const problem = looksLikeWorkspaceManifest(parsed)
      ? `UIX_SERVER_REGISTRY points to a workspace manifest instead of a server registry: ${absoluteRegistryPath}.`
      : `Invalid server workspace registry: ${absoluteRegistryPath}.`;
    throw new Error(
      `${problem} Expected example: ${WorkspaceRegistryFileExample}. Schema: ${WorkspaceRegistryFileSchemaText}`,
      { cause: error },
    );
  }

  const ids = new Set<string>();
  const entries: RegisteredWorkspace[] = [];
  for (const source of registry.workspaces) {
    assertWorkspaceCatalogId(source.id);
    if (ids.has(source.id)) {
      throw new Error(`Duplicate workspace id: ${source.id}`);
    }
    ids.add(source.id);

    const manifestPath = resolve(
      dirname(absoluteRegistryPath),
      source.manifest,
    );
    if (basename(manifestPath) !== WorkspaceManifestFileName) {
      throw new Error(
        `Workspace ${source.id} must point to ${WorkspaceManifestFileName}`,
      );
    }
    const manifest = await readJsonFile(
      manifestPath,
      `workspace manifest for ${source.id}`,
    );
    let name: string;
    try {
      name = Value.Parse(WorkspaceNameSchema, manifest).name;
    } catch (error) {
      throw new Error(`Invalid workspace manifest for ${source.id}`, {
        cause: error,
      });
    }

    entries.push(
      Object.freeze({
        id: toWorkspaceId(source.id),
        name,
        workspace: Object.freeze(resolveWorkspace(manifestPath)),
      }),
    );
  }

  return new LoadedWorkspaceRegistry(Object.freeze(entries));
}

function looksLikeWorkspaceManifest(value: unknown): boolean {
  return (
    typeof value === "object" &&
    value !== null &&
    "name" in value &&
    "features" in value
  );
}

async function readJsonFile(path: string, label: string): Promise<unknown> {
  let source: string;
  try {
    source = await readFile(path, "utf8");
  } catch (error) {
    throw new Error(`Unable to read ${label}: ${path}`, { cause: error });
  }
  try {
    return JSON.parse(source) as unknown;
  } catch (error) {
    throw new Error(`Invalid JSON in ${label}: ${path}`, { cause: error });
  }
}
