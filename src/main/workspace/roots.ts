// Resolves stable workspace storage, agent working, and manifest paths from one startup target.
//
// `stateRoot` anchors durable cockpit state and remains separate from the
// potentially movable agent cwd. The manifest path may not exist yet because
// each reload owns its disk read.

import path from "node:path";
import process from "node:process";

import { WorkspaceManifestFileName } from "../features/manifest";

export interface Workspace {
  stateRoot: string;
  agentCwd: string;
  /** Absolute path where this workspace's manifest lives (or would live). */
  manifestPath: string;
}

/** Resolve a manifest-file or directory target, defaulting to the current working directory. */
export function resolveWorkspace(target?: string): Workspace {
  const resolved = path.resolve(target ?? process.cwd());

  const root =
    path.basename(resolved) === WorkspaceManifestFileName
      ? path.dirname(resolved)
      : resolved;

  return {
    stateRoot: root,
    agentCwd: root,
    manifestPath: path.join(root, WorkspaceManifestFileName),
  };
}
