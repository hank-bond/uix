// workspace manifest.
//
// `uix.workspace.json` in the workspace root is the composition: a name plus
// an explicit ordered array of feature entries with entry-file references
// (relative to the manifest, or absolute for shared/cross-workspace features)
// and feature-local settings. Manifest order
// is load order; there is no auto-discovery. Extra fields are tolerated so
// later additions (layout, agent config, links) don't break older readers.
// See docs/decisions/2026-07-02-workspace-manifest-not-discovery.md.

import path from "node:path";

import { Type, type Static } from "typebox";
import { Value } from "typebox/value";

export const WorkspaceManifestFileName = "uix.workspace.json";

export const WorkspaceManifestFeatureSchema = Type.Object({
  entry: Type.String(),
  settings: Type.Optional(Type.Record(Type.String(), Type.Unknown())),
});

export const WorkspaceManifestSchema = Type.Object({
  name: Type.String({ minLength: 1 }),
  settings: Type.Optional(
    Type.Record(Type.String(), Type.Record(Type.String(), Type.Unknown())),
  ),
  /** Ordered feature entries; order is registration order. */
  features: Type.Array(WorkspaceManifestFeatureSchema),
});

export type WorkspaceManifest = Static<typeof WorkspaceManifestSchema>;
export type WorkspaceManifestFeature = Static<
  typeof WorkspaceManifestFeatureSchema
>;

/** A manifest feature reference resolved to an absolute entry path. */
export interface ManifestFeatureRef {
  /** The manifest entry index, used to bind settings before the feature id is known. */
  index: number;
  /** The entry ref as written in the manifest — the human/agent-facing label. */
  ref: string;
  /** Absolute entry-file path, resolved against the manifest's directory. */
  entry: string;
}

export interface ParsedWorkspaceManifest {
  manifest: WorkspaceManifest;
  features: ManifestFeatureRef[];
}

/** Validates and resolves one already-read manifest tree. */
export function parseWorkspaceManifest(
  parsed: unknown,
  manifestPath: string,
): ParsedWorkspaceManifest {
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
    features: manifest.features.map((feature, index) => ({
      index,
      ref: feature.entry,
      entry: path.resolve(dir, feature.entry),
    })),
  };
}
