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

/** Encode a feature root on an origin distinct from workspace resource origins. */
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

/** Return undefined for malformed addresses or alternate page directories. */
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
    // The page directory must equal the feature root so relative links preserve the binding.
    // Preserve the encoded path for route matching in the workspace runtime.
    if (new URL(".", url).href !== root) return undefined;
    if (url.href !== `${root}${pathname.slice(1)}${url.search}${url.hash}`)
      return undefined;
    return { binding, namespace, pathname, queryString: url.search.slice(1) };
  } catch {
    // Malformed browser addresses are route misses, not host failures.
    return undefined;
  }
}
