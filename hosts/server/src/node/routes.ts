// Defines the server host's browser-visible workspace routes and canonical path encoding.

import type { SessionId, WorkspaceId } from "@uix/runtime";

export const WorkspacePageRoute = "/workspaces/:workspaceId";
export const WorkspaceSessionPageRoute =
  "/workspaces/:workspaceId/sessions/:sessionId";
export const WorkspaceResourceRoute = "/workspaces/:workspaceId/resources/*";

/** Encode one stateless workspace-shell path. */
export function toWorkspacePath(workspaceId: WorkspaceId): string {
  return `/workspaces/${encodeURIComponent(workspaceId)}`;
}

/** Encode one canonical workspace-session path. */
export function toWorkspaceSessionPath(
  workspaceId: WorkspaceId,
  sessionId: SessionId,
): string {
  return `${toWorkspacePath(workspaceId)}/sessions/${encodeURIComponent(sessionId)}`;
}
