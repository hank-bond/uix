// Normalizes deployment-authored public origins and derives canonical workspace locations from them.

import type { WorkspaceId } from "@uix/runtime/workspace";

/** Accept one HTTP origin without credentials, path state, query, or fragment. */
export function normalizePublicOrigin(value: string | URL): string {
  const url = new URL(value.toString());
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Public origin must use HTTP or HTTPS");
  }
  if (url.username || url.password) {
    throw new Error("Public origin must not contain credentials");
  }
  if (url.pathname !== "/" || url.search || url.hash) {
    throw new Error(
      "Public origin must not contain a path, query, or fragment",
    );
  }
  return url.origin;
}

/** Derive an absolute canonical workspace location from deployment policy. */
export function toWorkspaceLocation(
  publicOrigin: string,
  workspaceId: WorkspaceId,
): string {
  return new URL(`/w/${encodeURIComponent(workspaceId)}`, `${publicOrigin}/`)
    .href;
}
