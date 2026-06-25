// workspace roots.
//
// Two roots, deliberately separate even though they are equal today:
//
//   stateRoot — where `.uix` lives: the canvas content store and the pinned pi
//     session dir. Stable for the life of a conversation; it must NOT move when
//     the agent relocates to a git worktree, or the conversation's canvases and
//     session file would be orphaned.
//   agentCwd  — what pi's coding tools (bash/read/edit/grep) operate against,
//     and what the session header records. This is the single mutable seam a
//     future worktree shift moves; keeping it distinct from stateRoot is what
//     lets that shift leave the canvases and session file in place.
//
// Resolved once at boot. A future project-picker replaces process.cwd() here.

import process from "node:process";

export interface Workspace {
  stateRoot: string;
  agentCwd: string;
}

export function resolveWorkspace(): Workspace {
  const root = process.cwd();
  return { stateRoot: root, agentCwd: root };
}
