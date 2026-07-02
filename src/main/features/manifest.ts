// workspace manifest.
//
// `uix.workspace.json` in the workspace root is the composition: a name plus
// an explicit ordered array of feature entry-file references (relative to the
// manifest, or absolute for shared/cross-workspace features). Manifest order
// is load order; there is no auto-discovery. Extra fields are tolerated so
// later additions (layout, agent config, links) don't break older readers.
// See docs/decisions/2026-07-02-workspace-manifest-not-discovery.md.

import { readFile } from "node:fs/promises";
import path from "node:path";

import { Type, type Static } from "typebox";
import { Value } from "typebox/value";

export const WorkspaceManifestFileName = "uix.workspace.json";

export const WorkspaceManifestSchema = Type.Object({
  name: Type.String(),
  /** Ordered feature entry-file refs; order is registration order. */
  features: Type.Array(Type.String()),
});

export type WorkspaceManifest = Static<typeof WorkspaceManifestSchema>;

/** A manifest feature reference resolved to an absolute entry path. */
export interface ManifestFeatureRef {
  /** The ref as written in the manifest — the human/agent-facing label. */
  ref: string;
  /** Absolute entry-file path, resolved against the manifest's directory. */
  entry: string;
}

/**
 * Reads and validates a workspace manifest, resolving its feature refs.
 * Throws with a message naming the file and what's wrong — the caller
 * decides whether that fails startup soft (bundled-only) or rejects a
 * reload (leaving the current tree intact).
 */
export async function readWorkspaceManifest(
  manifestPath: string,
): Promise<{ manifest: WorkspaceManifest; features: ManifestFeatureRef[] }> {
  let raw: string;
  try {
    raw = await readFile(manifestPath, "utf8");
  } catch (err) {
    throw new Error(
      `workspace manifest unreadable: ${manifestPath} (${(err as Error).message})`,
      { cause: err },
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new Error(
      `workspace manifest is not valid JSON: ${manifestPath} (${(err as Error).message})`,
      { cause: err },
    );
  }

  let manifest: WorkspaceManifest;
  try {
    manifest = Value.Parse(WorkspaceManifestSchema, parsed);
  } catch (err) {
    throw new Error(
      `workspace manifest does not match schema: ${manifestPath} (${(err as Error).message})`,
      { cause: err },
    );
  }

  const dir = path.dirname(manifestPath);
  return {
    manifest,
    features: manifest.features.map((ref) => ({
      ref,
      entry: path.resolve(dir, ref),
    })),
  };
}
