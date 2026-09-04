// Normalizes resource routes and encodes and decodes host-neutral logical URLs.
//
// Resource routes add resource identity and origin policy around the shared
// feature-relative route-pattern codec. The `uix-resource` URL remains the
// host-neutral logical address consumed by current resource transports.

import type { TSchema } from "typebox";

import {
  decodeRouteUrlParts,
  encodeRouteUrlParts,
  type NormalizedRoutePattern,
  normalizeRoutePattern,
  type RoutePattern,
  type RoutePatternParams,
  type RoutePatternParamValue,
  type RoutePatternValues,
} from "./path-pattern";

export const ResourceProtocolScheme = "uix-resource";

const ResourceUrlBrand: unique symbol = Symbol("ResourceUrl");

export type ResourceUrl = string & {
  readonly [ResourceUrlBrand]: true;
};

export type ResourceOrigin = "workspace" | "feature";

export interface ResourceRoute<
  Query extends TSchema = TSchema,
> extends RoutePattern<Query> {
  origin: ResourceOrigin;
}

export type ResourceRouteParamValue = RoutePatternParamValue;
export type ResourceRouteParams = RoutePatternParams;

export interface NormalizedResourceRoute<
  Query extends TSchema = TSchema,
> extends NormalizedRoutePattern<Query> {
  origin: ResourceOrigin;
}

export interface ResourceAddress {
  featureId: string;
  name: string;
  workspaceId: string;
}

export type ResourceRouteValues = RoutePatternValues;

export type EncodeResourceUrlInput = ResourceAddress &
  Partial<ResourceRouteValues>;

export type DecodeResourceUrlInput = ResourceAddress & {
  url: string;
};

export type DecodedResourceUrl = ResourceAddress & ResourceRouteValues;

type Result<T, Status extends number = number> =
  | { ok: true; value: T }
  | { ok: false; status: Status; reason: string };

type DecodeResult<T, Status extends number = 400 | 404> = Result<T, Status>;

export type DecodeResourceUrlResult = DecodeResult<DecodedResourceUrl>;

const TransportTokenPattern = /^[a-z][a-z0-9-]*$/;

export function normalizeResourceRoute<const Query extends TSchema>(
  route: ResourceRoute<Query>,
): NormalizedResourceRoute<Query> {
  assertOrigin(route.origin);
  return {
    ...normalizeRoutePattern(route),
    origin: route.origin,
  };
}

export function encodeResourceOrigin(
  route: NormalizedResourceRoute,
  featureId: string,
  workspaceId: string,
): { origin: string; pathPrefix: string } {
  // Feature-origin resources put the feature in the host so Chromium isolates
  // them from the workspace. Workspace-origin resources put the feature in the
  // path because the host only identifies the workspace.
  if (route.origin === "feature") {
    return {
      origin: `${ResourceProtocolScheme}://${featureId}.${workspaceId}`,
      pathPrefix: "",
    };
  }
  return {
    origin: `${ResourceProtocolScheme}://${workspaceId}`,
    pathPrefix: `/${featureId}`,
  };
}

export function encodeResourceUrl(
  route: NormalizedResourceRoute,
  location: EncodeResourceUrlInput,
): ResourceUrl {
  const { featureId, name, workspaceId } = validateResourceAddress(location);
  const { pathname, search } = encodeRouteUrlParts(route, location);
  const { origin, pathPrefix } = encodeResourceOrigin(
    route,
    featureId,
    workspaceId,
  );
  return `${origin}${pathPrefix}/${name}${pathname}${search}` as ResourceUrl;
}

export function decodeResourceUrl(
  route: NormalizedResourceRoute,
  location: DecodeResourceUrlInput,
): DecodeResourceUrlResult {
  const { featureId, name, workspaceId } = validateResourceAddress(location);
  const url = toUrl(location.url);
  if (!url) return { ok: false, status: 400, reason: "Invalid resource URL." };

  const base = decodeBase(route, { featureId, name, workspaceId }, url);
  if (!base.ok) return base;

  const decoded = decodeRouteUrlParts(route, {
    pathname: base.value.pathname,
    searchParams: url.searchParams,
  });
  if (!decoded.ok) return decoded;

  return {
    ok: true,
    value: {
      featureId,
      name,
      workspaceId,
      params: decoded.value.params,
      query: decoded.value.query,
    },
  };
}

function decodeBase(
  route: NormalizedResourceRoute,
  expected: ResourceAddress,
  url: URL,
): DecodeResult<{ pathname: string }, 404> {
  // URL.protocol includes its trailing colon.
  const protocol = url.protocol.slice(0, -1);
  if (protocol !== ResourceProtocolScheme) {
    return { ok: false, status: 404, reason: "Resource origin did not match." };
  }

  const rawPathSegments = url.pathname
    .split("/")
    .filter((segment) => segment !== "");

  if (route.origin === "feature") {
    if (url.hostname !== `${expected.featureId}.${expected.workspaceId}`) {
      return {
        ok: false,
        status: 404,
        reason: "Resource origin did not match.",
      };
    }
    const [rawName, ...pathSegments] = rawPathSegments;
    if (rawName !== expected.name) {
      return { ok: false, status: 404, reason: "Resource type did not match." };
    }
    return { ok: true, value: { pathname: `/${pathSegments.join("/")}` } };
  }

  if (url.hostname !== expected.workspaceId) {
    return { ok: false, status: 404, reason: "Resource origin did not match." };
  }
  const [rawFeatureId, rawName, ...pathSegments] = rawPathSegments;
  if (rawFeatureId !== expected.featureId || rawName !== expected.name) {
    return { ok: false, status: 404, reason: "Resource type did not match." };
  }
  return { ok: true, value: { pathname: `/${pathSegments.join("/")}` } };
}

function validateResourceAddress(address: ResourceAddress): ResourceAddress {
  return {
    featureId: validateTransportToken("feature id", address.featureId),
    name: validateTransportToken("resource name", address.name),
    workspaceId: validateTransportToken("workspace id", address.workspaceId),
  };
}

function validateTransportToken(label: string, value: string): string {
  if (!TransportTokenPattern.test(value)) {
    throw new Error(
      `Invalid ${label}: ${value}. Expected ${String(TransportTokenPattern)}.`,
    );
  }
  return value;
}

function assertOrigin(origin: unknown): asserts origin is ResourceOrigin {
  if (origin !== "workspace" && origin !== "feature") {
    throw new Error("Invalid resource origin. Expected workspace or feature.");
  }
}

function toUrl(value: string): URL | null {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}
