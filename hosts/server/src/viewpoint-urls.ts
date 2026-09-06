// Encodes and decodes the server's attachment-bound feature directory URLs.

import { type Static, Type } from "typebox";
import { Value } from "typebox/value";

import { isIdToken } from "@uix/api/contribution-id";
import {
  type FeatureWebRootUrl,
  parseFeatureWebRootUrl,
} from "@uix/api/feature-web-root-url";

const FeatureWebRootAddressSchema = Type.Object(
  {
    publicOrigin: Type.String(),
    workspaceId: Type.String({ pattern: "^[a-z][a-z0-9-]*$" }),
    binding: Type.String({ minLength: 1 }),
    featureId: Type.String(),
  },
  { additionalProperties: false },
);
type FeatureWebRootAddress = Static<typeof FeatureWebRootAddressSchema>;

/** Encode one feature directory under the deployment's public origin. */
export function encodeFeatureWebRoot(
  address: FeatureWebRootAddress,
): FeatureWebRootUrl {
  Value.Assert(FeatureWebRootAddressSchema, address);
  const { publicOrigin, workspaceId, binding, featureId } = address;
  if (!isIdToken(featureId)) {
    throw new Error("Invalid viewpoint namespace");
  }
  // Dot segments cannot retain the feature directory after browser normalization.
  if (binding === "." || binding === "..") {
    throw new Error("Invalid viewpoint binding");
  }
  const origin = new URL(publicOrigin);
  if (origin.protocol !== "http:" && origin.protocol !== "https:") {
    throw new Error("Viewpoint URLs require an HTTP public origin");
  }
  return parseFeatureWebRootUrl(
    `${origin.origin}/workspaces/${workspaceId}/viewpoints/${encodeURIComponent(binding)}/${featureId}/`,
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
  const prefix = `/workspaces/${workspaceId}/viewpoints/`;
  if (!url.pathname.startsWith(prefix) || url.username || url.password) {
    return undefined;
  }
  const match = /^([^/]+)\/([^/]+)(\/.*)$/.exec(
    url.pathname.slice(prefix.length),
  );
  if (!match?.[1] || !match[2] || !match[3]) return undefined;
  try {
    const binding = decodeURIComponent(match[1]);
    const namespace = decodeURIComponent(match[2]);
    const pathname = match[3];
    const root = encodeFeatureWebRoot({
      publicOrigin: url.origin,
      workspaceId,
      binding,
      featureId: namespace,
    });
    // Complete pages must retain this directory for native relative addressing.
    if (new URL(".", url).href !== root) return undefined;
    if (url.href !== `${root}${pathname.slice(1)}${url.search}${url.hash}`) {
      return undefined;
    }
    return { binding, namespace, pathname, queryString: url.search.slice(1) };
  } catch {
    // Malformed browser addresses are route misses, not host failures.
    return undefined;
  }
}
