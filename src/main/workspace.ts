// workspace roots.
//
// A workspace is a directory defined by its `uix.workspace.json` manifest
// (docs/decisions/2026-07-02-workspace-manifest-not-discovery.md). Everything
// derives from where that file lives:
//
//   stateRoot — where `.uix` lives: the canvas content store and the pinned pi
//     session dir. Stable for the life of a conversation; it must NOT move when
//     the agent relocates to a git worktree, or the conversation's canvases and
//     session file would be orphaned.
//   agentCwd  — what pi's coding tools (bash/read/edit/grep) operate against,
//     and what the session header records. Defaults to the workspace root but
//     is the single mutable seam a future worktree shift moves; keeping it
//     distinct from stateRoot is what lets that shift leave the canvases and
//     session file in place.
//   manifestPath — where the workspace's manifest is (or would be: existence
//     is the loader's per-pass concern, so a manifest created after boot is
//     picked up on the next reload).
//
// Resolved once at boot from a target: a manifest file path, a workspace
// directory, or — absent both — the cwd (the dev fallback the start picker
// replaces as the normal entry point in M3).

import path from "node:path";
import process from "node:process";

import { WorkspaceManifestFileName } from "./features/manifest";

export interface Workspace {
  stateRoot: string;
  agentCwd: string;
  /** Absolute path where this workspace's manifest lives (or would live). */
  manifestPath: string;
}

/**
 * Resolves the workspace from a target: an absolute/relative path to a
 * `uix.workspace.json`, or a workspace directory. No target means the cwd.
 * The picker (M3) passes the manifest path of the workspace the user opened;
 * dev flows can set `UIX_WORKSPACE`.
 */
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
