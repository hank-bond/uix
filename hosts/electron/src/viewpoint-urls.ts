// Encodes and decodes Electron's attachment-bound feature directory URLs.

import { isIdToken } from "@uix/api/contribution-id";
import {
  type FeatureWebRootUrl,
  parseFeatureWebRootUrl,
} from "@uix/api/feature-web-root-url";
import { ResourceProtocolScheme } from "@uix/api/resource-routes";

const WorkspaceHostPattern = /^[a-z][a-z0-9-]*$/;

interface FeatureWebRootAddress {
  readonly workspaceId: string;
  readonly binding: string;
  readonly featureId: string;
}

/** Keep viewpoint origins distinct from both existing resource origin forms. */
export function encodeFeatureWebRoot({
  workspaceId,
  binding,
  featureId,
}: FeatureWebRootAddress): FeatureWebRootUrl {
  if (!isIdToken(featureId) || !WorkspaceHostPattern.test(workspaceId)) {
    throw new Error("Invalid Electron viewpoint namespace");
  }
  if (!binding || binding === "." || binding === "..") {
    throw new Error("Invalid Electron viewpoint binding");
  }
  return parseFeatureWebRootUrl(
    `${ResourceProtocolScheme}://${featureId}.viewpoint.${workspaceId}/${encodeURIComponent(binding)}/`,
  );
}

interface ViewpointAddress {
  readonly binding: string;
  readonly namespace: string;
  readonly pathname: string;
  readonly queryString: string;
}

/** Decode only canonical locations without normalizing an alias onto a page. */
export function decodeViewpointUrl(
  url: URL,
  workspaceId: string,
): ViewpointAddress | undefined {
  const suffix = `.viewpoint.${workspaceId}`;
  if (
    !url.hostname.endsWith(suffix) ||
    url.username ||
    url.password ||
    url.port
  )
    return undefined;
  const namespace = url.hostname.slice(0, -suffix.length);
  const separator = url.pathname.indexOf("/", 1);
  if (separator < 0) return undefined;
  try {
    const binding = decodeURIComponent(url.pathname.slice(1, separator));
    const root = encodeFeatureWebRoot({
      workspaceId,
      binding,
      featureId: namespace,
    });
    const pathname = url.pathname.slice(separator);
    // Complete pages occupy exactly the root or one literal segment below it.
    // Keep the encoded path unchanged for semantic matching in the runtime.
    if (new URL(".", url).href !== root) return undefined;
    if (url.href !== `${root}${pathname.slice(1)}${url.search}${url.hash}`)
      return undefined;
    return { binding, namespace, pathname, queryString: url.search.slice(1) };
  } catch {
    // Malformed browser addresses are route misses, not host failures.
    return undefined;
  }
}
