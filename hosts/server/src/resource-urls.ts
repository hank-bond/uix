// Maps host-neutral logical resource addresses to the server's HTTP content plane.

import { ResourceProtocolScheme } from "@uix/api/resource-routes";

const WorkspaceResourcePrefix = "/workspaces";

/** Encode the HTTP path prefix that serves one workspace's logical resources. */
export function toWorkspaceResourcePath(workspaceId: string): string {
  return `${WorkspaceResourcePrefix}/${encodeURIComponent(workspaceId)}/resources`;
}

/** Map a logical resource URL or origin to this server's browser transport. */
export function resolveServerResourceUrl(
  publicOrigin: string,
  workspaceId: string,
  logicalUrl: string,
): string {
  const logical = parseLogicalResourceUrl(logicalUrl, workspaceId);
  const origin = new URL(publicOrigin).origin;
  if (logical.pathname === "" && logical.search === "" && logical.hash === "") {
    return origin;
  }

  const transport = new URL(
    `${toWorkspaceResourcePath(workspaceId)}/${logical.hostname}${logical.pathname}`,
    `${origin}/`,
  );
  transport.search = logical.search;
  return transport.href;
}

/** Restore one logical resource URL from an accepted HTTP content request. */
export function parseServerResourceRequestUrl(
  requestUrl: string,
  expectedWorkspaceId: string,
): URL {
  const transport = new URL(requestUrl, "http://uix.invalid");
  const prefix = `${toWorkspaceResourcePath(expectedWorkspaceId)}/`;
  if (!transport.pathname.startsWith(prefix)) {
    throw new Error("Resource request does not match its workspace route");
  }
  const logicalAddress = transport.pathname.slice(prefix.length);
  if (!logicalAddress.includes("/")) {
    throw new Error("Resource URL must name content");
  }
  return parseLogicalResourceUrl(
    `${ResourceProtocolScheme}://${logicalAddress}${transport.search}`,
    expectedWorkspaceId,
  );
}

/** Validate and retain one logical URL accepted by a workspace content route. */
export function parseLogicalResourceUrl(
  logicalUrl: string,
  expectedWorkspaceId: string,
): URL {
  const logical = new URL(logicalUrl);
  if (logical.protocol !== `${ResourceProtocolScheme}:`) {
    throw new Error("Resource URL must use the logical UIX resource scheme");
  }
  if (logical.username || logical.password || logical.port || logical.hash) {
    throw new Error("Resource URL contains unsupported address fields");
  }
  const isWorkspaceOrigin = logical.hostname === expectedWorkspaceId;
  const isFeatureOrigin = logical.hostname.endsWith(`.${expectedWorkspaceId}`);
  if (!isWorkspaceOrigin && !isFeatureOrigin) {
    throw new Error("Resource URL does not belong to this workspace");
  }
  return logical;
}
