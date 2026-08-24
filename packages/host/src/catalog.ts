// The versioned machine-readable workspace catalog shared by host capability adapters.

import { Type } from "typebox";
import { Value } from "typebox/value";

export const WorkspaceCatalogVersion = 1 as const;

const WorkspaceCatalogIdPattern = /^[A-Za-z0-9][A-Za-z0-9._~-]*$/;

interface WorkspaceCatalogEntry {
  readonly id: string;
  readonly name: string;
  readonly location: string;
}

export interface WorkspaceCatalog {
  readonly version: typeof WorkspaceCatalogVersion;
  readonly workspaces: readonly WorkspaceCatalogEntry[];
}

const WorkspaceCatalogSchema = Type.Unsafe<WorkspaceCatalog>(
  Type.Object(
    {
      version: Type.Literal(WorkspaceCatalogVersion),
      workspaces: Type.Array(
        Type.Object(
          {
            id: Type.String({ minLength: 1 }),
            name: Type.String({ minLength: 1 }),
            location: Type.String({ minLength: 1 }),
          },
          { additionalProperties: false },
        ),
      ),
    },
    { additionalProperties: false },
  ),
);

/** Validate an opaque workspace id for use as one canonical URL segment. */
export function assertWorkspaceCatalogId(id: string): void {
  if (!WorkspaceCatalogIdPattern.test(id)) {
    throw new Error(`Invalid workspace catalog id: ${JSON.stringify(id)}`);
  }
}

/** Validate an external workspace catalog at its transport boundary. */
export function parseWorkspaceCatalog(value: unknown): WorkspaceCatalog {
  const catalog = Value.Parse(WorkspaceCatalogSchema, value);
  for (const workspace of catalog.workspaces) {
    assertWorkspaceCatalogId(workspace.id);
    const location = new URL(workspace.location);
    if (location.protocol !== "http:" && location.protocol !== "https:") {
      throw new Error(
        `Invalid workspace catalog location: ${workspace.location}`,
      );
    }
  }
  return catalog;
}
