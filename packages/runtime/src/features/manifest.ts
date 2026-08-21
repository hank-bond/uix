// Validates workspace manifests and resolves each ordered feature entry to an absolute path.

import path from "node:path";

import { type Static, Type } from "typebox";
import { Value } from "typebox/value";

export const WorkspaceManifestFileName = "uix.workspace.json";

export const WorkspaceManifestFeatureSchema = Type.Object({
  entry: Type.String(),
  settings: Type.Optional(Type.Record(Type.String(), Type.Unknown())),
});

/**
 * Validate the feature-composition fields while retaining unrelated top-level
 * fields owned by other workspace concerns.
 */
export const WorkspaceManifestSchema = Type.Object({
  name: Type.String({ minLength: 1 }),
  settings: Type.Optional(
    Type.Record(Type.String(), Type.Record(Type.String(), Type.Unknown())),
  ),
  /** Ordered feature entries. Declaration order is composition order. */
  features: Type.Array(WorkspaceManifestFeatureSchema),
});

export type WorkspaceManifest = Static<typeof WorkspaceManifestSchema>;
export type WorkspaceManifestFeature = Static<
  typeof WorkspaceManifestFeatureSchema
>;

/** A manifest feature reference resolved to an absolute entry path. */
export interface ManifestFeatureRef {
  /** The manifest entry index, used to bind settings before the loader knows the feature id. */
  index: number;
  /** The entry ref as written in the manifest: the human/agent-facing label. */
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
