// Defines the server public-origin policy for requests and canonical locations.

import type { WorkspaceId } from "@uix/runtime/workspace";

import { toWorkspacePath } from "./routes";

type PublicOriginRejection =
  | {
      readonly status: 421;
      readonly code: "public_authority_mismatch";
      readonly message: string;
    }
  | {
      readonly status: 403;
      readonly code: "browser_origin_mismatch";
      readonly message: string;
    };

/** Normalize one HTTP origin without credentials, path state, query, or fragment. */
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

/** Derive a rejection when request authority or browser origin falls outside deployment policy. */
export function derivePublicOriginRejection(
  publicOrigin: string,
  requestAuthority: string | undefined,
  browserOrigin: string | undefined,
): PublicOriginRejection | undefined {
  const publicOriginUrl = new URL(publicOrigin);
  if (!isRequestAuthorityForPublicOrigin(requestAuthority, publicOriginUrl)) {
    return {
      status: 421,
      code: "public_authority_mismatch",
      message: "Request authority does not match the configured public origin",
    };
  }
  if (
    browserOrigin !== undefined &&
    !isBrowserOriginForPublicOrigin(browserOrigin, publicOriginUrl)
  ) {
    return {
      status: 403,
      code: "browser_origin_mismatch",
      message: "Browser origin does not match the configured public origin",
    };
  }
  return undefined;
}

/** Derive an absolute canonical workspace location from deployment policy. */
export function toWorkspaceLocation(
  publicOrigin: string,
  workspaceId: WorkspaceId,
): string {
  return new URL(toWorkspacePath(workspaceId), `${publicOrigin}/`).href;
}

function isRequestAuthorityForPublicOrigin(
  requestAuthority: string | undefined,
  publicOrigin: URL,
): boolean {
  if (!requestAuthority) return false;
  try {
    const candidate = new URL(`${publicOrigin.protocol}//${requestAuthority}`);
    if (
      candidate.username ||
      candidate.password ||
      candidate.pathname !== "/" ||
      candidate.search ||
      candidate.hash
    ) {
      return false;
    }
    return candidate.origin === publicOrigin.origin;
  } catch {
    return false;
  }
}

function isBrowserOriginForPublicOrigin(
  browserOrigin: string,
  publicOrigin: URL,
): boolean {
  try {
    return normalizePublicOrigin(browserOrigin) === publicOrigin.origin;
  } catch {
    return false;
  }
}
