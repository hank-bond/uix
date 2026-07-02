// resource route normalization and transport URL codecs.
//
// Resource routes describe a feature-owned browser-loadable resource location
// independently of the transport URL used to fetch it. The same normalized
// route is used in both directions:
//
// 1. Declaration/init: a feature declares a route path, query schema, and
//    origin policy (`workspace` or `feature`). UIX normalizes and validates that
//    declaration before any request can hit it.
// 2. Encode/render: workspace/runtime code supplies the resource address
//    (workspace id + feature id + resource name) plus route values
//    (path params + query). UIX validates those values and returns a branded
//    `ResourceUrl` string for iframe `src`, script/style links, fetch, etc.
// 3. Decode/request: Electron/hosted transport receives an untrusted URL string.
//    UIX parses it into URL parts, verifies the transport scheme + origin host +
//    resource address, matches the remaining path against the normalized route,
//    validates query with TypeBox, then hands params/query to the contribution.
//
// The Electron scheme is a transport/permission class (`uix-resource`), not the
// semantic resource type. Origin partitioning comes from the URL host.

import type { TSchema } from "typebox";
import { Value } from "typebox/value";

export const ResourceProtocolScheme = "uix-resource";

const ResourceUrlBrand: unique symbol = Symbol("ResourceUrl");

export type ResourceUrl = string & {
  readonly [ResourceUrlBrand]: true;
};

export type ResourceOrigin = "workspace" | "feature";

export interface ResourceRoute<Query extends TSchema = TSchema> {
  path: string;
  query?: Query;
  origin: ResourceOrigin;
}

export type ResourceRouteParamValue = string | readonly string[];
export type ResourceRouteParams = Record<string, ResourceRouteParamValue>;

export interface NormalizedResourceRoute<Query extends TSchema = TSchema> {
  path: string;
  query?: Query;
  origin: ResourceOrigin;
  segments: readonly PatternSegment[];
  params: readonly PatternParam[];
}

type PatternParam =
  | { kind: "param"; name: string }
  | { kind: "splat"; name: string };

type PatternSegment = { kind: "static"; value: string } | PatternParam;

export interface ResourceAddress {
  featureId: string;
  name: string;
  workspaceId: string;
}

export interface ResourceRouteValues {
  params: ResourceRouteParams;
  query: unknown;
}

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

const RouteParamNamePattern = /^[A-Za-z_][A-Za-z0-9_]*$/;
const TransportTokenPattern = /^[a-z][a-z0-9-]*$/;

export function normalizeResourceRoute<const Query extends TSchema>(
  route: ResourceRoute<Query>,
): NormalizedResourceRoute<Query> {
  assertOrigin(route.origin);
  if (!route.path.startsWith("/")) {
    throw new Error(
      `Invalid resource route: ${route.path}. Expected leading /.`,
    );
  }
  if (route.path.includes("?") || route.path.includes("#")) {
    throw new Error(
      `Invalid resource route: ${route.path}. Query and hash are declared separately.`,
    );
  }

  const rawSegments = route.path === "/" ? [] : route.path.slice(1).split("/");
  if (rawSegments.some((segment) => segment === "")) {
    throw new Error(
      `Invalid resource route: ${route.path}. Empty segments are not allowed.`,
    );
  }

  const seen = new Set<string>();
  const segments = rawSegments.map((segment, index): PatternSegment => {
    if (!segment.startsWith(":"))
      return { kind: "static", value: decodeRouteLiteral(segment) };

    const splat = segment.endsWith("*");
    const name = segment.slice(1, splat ? -1 : undefined);
    if (!RouteParamNamePattern.test(name)) {
      throw new Error(`Invalid resource route param: ${segment}.`);
    }
    if (seen.has(name)) {
      throw new Error(`Duplicate resource route param: ${name}.`);
    }
    seen.add(name);
    if (splat && index !== rawSegments.length - 1) {
      throw new Error(
        `Invalid resource route: splat param ${name} must be terminal.`,
      );
    }
    return splat ? { kind: "splat", name } : { kind: "param", name };
  });

  const params = segments
    .filter(
      (
        segment,
      ): segment is Extract<PatternSegment, { kind: "param" | "splat" }> =>
        segment.kind === "param" || segment.kind === "splat",
    )
    .map((segment) => ({ name: segment.name, kind: segment.kind }));

  return {
    path: route.path,
    query: route.query,
    origin: route.origin,
    segments,
    params,
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
  const params = encodeRoutePath(route, location.params ?? {});
  const query = encodeQuery(route, location.query);

  const { origin, pathPrefix } = encodeResourceOrigin(
    route,
    featureId,
    workspaceId,
  );
  return `${origin}${pathPrefix}/${name}${params}${query}` as ResourceUrl;
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

  const params = decodeRoutePath(route, base.value.pathSegments);
  if (!params.ok) return params;

  const query = decodeQuery(route, url.searchParams);
  if (!query.ok) return query;

  return {
    ok: true,
    value: {
      featureId,
      name,
      workspaceId,
      params: params.value,
      query: query.value,
    },
  };
}

function encodeRoutePath(
  route: NormalizedResourceRoute,
  params: ResourceRouteParams,
): string {
  assertRouteParamKeys(route, params);
  const pathSegments: string[] = [];

  for (const segment of route.segments) {
    if (segment.kind === "static") {
      pathSegments.push(encodeURIComponent(segment.value));
      continue;
    }

    const value = params[segment.name];
    if (segment.kind === "param") {
      if (typeof value !== "string") {
        throw new Error(
          `Invalid resource route param ${segment.name}: expected string.`,
        );
      }
      pathSegments.push(encodePathSegment(segment.name, value));
      continue;
    }

    if (!isStringArray(value)) {
      throw new Error(
        `Invalid resource route param ${segment.name}: expected string array.`,
      );
    }
    for (const item of value)
      pathSegments.push(encodePathSegment(segment.name, item));
  }

  return `/${pathSegments.join("/")}`;
}

function decodeRoutePath(
  route: NormalizedResourceRoute,
  pathSegments: readonly string[],
): DecodeResult<ResourceRouteParams> {
  const params: ResourceRouteParams = {};
  let index = 0;

  for (const segment of route.segments) {
    if (segment.kind === "splat") {
      const value = decodePathSegments(pathSegments.slice(index));
      if (!value.ok) return value;
      params[segment.name] = value.value;
      index = pathSegments.length;
      break;
    }

    const raw = pathSegments[index];
    if (raw === undefined) {
      return {
        ok: false,
        status: 404,
        reason: "Resource route did not match.",
      };
    }
    const decoded = decodePathSegment(raw);
    if (!decoded.ok) return decoded;

    if (segment.kind === "static") {
      if (decoded.value !== segment.value) {
        return {
          ok: false,
          status: 404,
          reason: "Resource route did not match.",
        };
      }
    } else {
      params[segment.name] = decoded.value;
    }
    index += 1;
  }

  if (index !== pathSegments.length) {
    return { ok: false, status: 404, reason: "Resource route did not match." };
  }

  return { ok: true, value: params };
}

function encodeQuery(
  route: NormalizedResourceRoute,
  rawQuery: unknown,
): string {
  if (!route.query) {
    if (rawQuery === undefined) return "";
    if (isPlainObject(rawQuery) && Object.keys(rawQuery).length === 0)
      return "";
    throw new Error("Resource route does not declare query params.");
  }

  const parsed = Value.Parse(route.query, rawQuery ?? {});
  if (!isPlainObject(parsed)) {
    throw new Error("Resource route query must parse to an object.");
  }

  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(parsed)) {
    if (value === undefined) continue;
    if (typeof value !== "string") {
      throw new Error(`Invalid resource route query ${key}: expected string.`);
    }
    search.set(key, value);
  }

  const encoded = search.toString();
  return encoded ? `?${encoded}` : "";
}

function decodeQuery(
  route: NormalizedResourceRoute,
  search: URLSearchParams,
): DecodeResult<unknown, 400> {
  const raw: Record<string, string> = {};
  for (const [key, value] of search.entries()) {
    if (Object.prototype.hasOwnProperty.call(raw, key)) {
      return {
        ok: false,
        status: 400,
        reason: `Duplicate query param: ${key}.`,
      };
    }
    raw[key] = value;
  }

  if (!route.query) {
    if (Object.keys(raw).length === 0) return { ok: true, value: {} };
    return {
      ok: false,
      status: 400,
      reason: "Resource route does not declare query params.",
    };
  }

  try {
    return { ok: true, value: Value.Parse(route.query, raw) };
  } catch {
    return { ok: false, status: 400, reason: "Invalid resource route query." };
  }
}

function decodeBase(
  route: NormalizedResourceRoute,
  expected: ResourceAddress,
  url: URL,
): DecodeResult<{ pathSegments: readonly string[] }, 404> {
  // remove the colon at the end
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
    return { ok: true, value: { pathSegments } };
  }

  if (url.hostname !== expected.workspaceId) {
    return { ok: false, status: 404, reason: "Resource origin did not match." };
  }
  const [rawFeatureId, rawName, ...pathSegments] = rawPathSegments;
  if (rawFeatureId !== expected.featureId || rawName !== expected.name) {
    return { ok: false, status: 404, reason: "Resource type did not match." };
  }
  return { ok: true, value: { pathSegments } };
}

function assertRouteParamKeys(
  route: NormalizedResourceRoute,
  params: ResourceRouteParams,
): void {
  const expected = new Set(route.params.map((param) => param.name));
  for (const key of Object.keys(params)) {
    if (!expected.has(key))
      throw new Error(`Unexpected resource route param: ${key}.`);
  }
  for (const key of expected) {
    if (!Object.prototype.hasOwnProperty.call(params, key)) {
      throw new Error(`Missing resource route param: ${key}.`);
    }
  }
}

function encodePathSegment(name: string, value: string): string {
  if (value === "" || value.includes("/")) {
    throw new Error(
      `Invalid resource route param ${name}: expected non-empty path segment.`,
    );
  }
  return encodeURIComponent(value);
}

function decodePathSegments(
  segments: readonly string[],
): DecodeResult<readonly string[], 400> {
  const decoded: string[] = [];
  for (const segment of segments) {
    const value = decodePathSegment(segment);
    if (!value.ok) return value;
    decoded.push(value.value);
  }
  return { ok: true, value: decoded };
}

function decodePathSegment(segment: string): DecodeResult<string, 400> {
  try {
    return { ok: true, value: decodeURIComponent(segment) };
  } catch {
    return {
      ok: false,
      status: 400,
      reason: "Malformed resource route path segment.",
    };
  }
}

function decodeRouteLiteral(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    throw new Error(`Invalid resource route segment: ${segment}.`);
  }
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
      `Invalid ${label}: ${value}. Expected ${TransportTokenPattern}.`,
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

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStringArray(value: unknown): value is readonly string[] {
  return (
    Array.isArray(value) && value.every((item) => typeof item === "string")
  );
}
