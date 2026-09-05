// Normalizes feature-relative route patterns and encodes and decodes their URL parts.
//
// Route patterns are transport-neutral. Address codecs add their own identity
// and physical transport around this feature-relative representation.

import type { TSchema } from "typebox";
import { Value } from "typebox/value";

/** A feature-relative path declaration with an optional query schema. */
export interface RoutePattern<Query extends TSchema = TSchema> {
  path: string;
  query?: Query;
}

/** One decoded route parameter: a segment string or terminal-splat segments. */
export type RoutePatternParamValue = string | readonly string[];

/** Decoded route parameters keyed by their declared names. */
export type RoutePatternParams = Record<string, RoutePatternParamValue>;

/** The canonical representation used to encode and decode one route pattern. */
export interface NormalizedRoutePattern<Query extends TSchema = TSchema> {
  query?: Query;
  segments: readonly PatternSegment[];
}

/** The decoded path parameters and schema-validated query value. */
export interface RoutePatternValues {
  params: RoutePatternParams;
  query: unknown;
}

/** One declared dynamic path member, used to validate a path-value schema. */
interface RoutePatternParam {
  readonly name: string;
  readonly kind: "param" | "splat";
}

/** List dynamic path members in declaration order. */
export function listRoutePatternParams(
  pattern: NormalizedRoutePattern,
): readonly RoutePatternParam[] {
  return pattern.segments.flatMap((segment) =>
    segment.kind === "static"
      ? []
      : [{ name: segment.name, kind: segment.kind }],
  );
}

/** Return a stable representation for duplicate pattern detection. */
export function toRoutePatternIdentity(
  pattern: NormalizedRoutePattern,
): string {
  return JSON.stringify(pattern.segments);
}

interface EncodedRouteUrlParts {
  pathname: string;
  search: string;
}

interface DecodeRouteUrlPartsInput {
  pathname: string;
  searchParams: URLSearchParams;
}

type PatternParam =
  | { kind: "param"; name: string }
  | { kind: "splat"; name: string };

type PatternSegment = { kind: "static"; value: string } | PatternParam;

type Result<T, Status extends number = number> =
  | { ok: true; value: T }
  | { ok: false; status: Status; reason: string };

type DecodeRouteUrlPartsResult = Result<RoutePatternValues, 400 | 404>;

const RouteParamNamePattern = /^[A-Za-z_][A-Za-z0-9_]*$/;

/** Normalize and validate one declared pattern before use. */
export function normalizeRoutePattern<const Query extends TSchema>(
  pattern: RoutePattern<Query>,
): NormalizedRoutePattern<Query> {
  if (!pattern.path.startsWith("/")) {
    throw new Error(
      `Invalid route pattern: ${pattern.path}. Expected leading /.`,
    );
  }
  if (pattern.path.includes("?") || pattern.path.includes("#")) {
    throw new Error(
      `Invalid route pattern: ${pattern.path}. Query and hash are declared separately.`,
    );
  }

  const rawSegments =
    pattern.path === "/" ? [] : pattern.path.slice(1).split("/");
  if (rawSegments.some((segment) => segment === "")) {
    throw new Error(
      `Invalid route pattern: ${pattern.path}. Empty segments are not allowed.`,
    );
  }

  const seen = new Set<string>();
  const segments = rawSegments.map((segment, index): PatternSegment => {
    if (!segment.startsWith(":"))
      return {
        kind: "static",
        value: decodeRouteLiteral(segment),
      };

    const splat = segment.endsWith("*");
    const name = segment.slice(1, splat ? -1 : undefined);
    if (!RouteParamNamePattern.test(name)) {
      throw new Error(`Invalid route pattern param: ${segment}.`);
    }
    if (seen.has(name)) {
      throw new Error(`Duplicate route pattern param: ${name}.`);
    }
    seen.add(name);
    if (splat && index !== rawSegments.length - 1) {
      throw new Error(
        `Invalid route pattern: splat param ${name} must be terminal.`,
      );
    }
    return splat ? { kind: "splat", name } : { kind: "param", name };
  });

  return {
    query: pattern.query,
    segments,
  };
}

/** Encode path and query values into feature-relative pathname and search components. */
export function encodeRouteUrlParts(
  pattern: NormalizedRoutePattern,
  values: Partial<RoutePatternValues> = {},
): EncodedRouteUrlParts {
  return {
    pathname: encodeRoutePath(pattern, values.params ?? {}),
    search: encodeQuery(pattern, values.query),
  };
}

/** Test one feature-relative pathname without decoding any query values. */
export function matchRoutePath(
  pattern: NormalizedRoutePattern,
  pathname: string,
):
  | { readonly ok: true }
  | {
      readonly ok: false;
      readonly status: 400 | 404;
      readonly reason: string;
    } {
  const decoded = decodeRoutePath(pattern, toPathSegments(pathname));
  return decoded.ok ? { ok: true } : decoded;
}

/** Decode and validate feature-relative pathname and search components. */
export function decodeRouteUrlParts(
  pattern: NormalizedRoutePattern,
  urlParts: DecodeRouteUrlPartsInput,
): DecodeRouteUrlPartsResult {
  const params = decodeRoutePath(pattern, toPathSegments(urlParts.pathname));
  if (!params.ok) return params;

  const query = decodeQuery(pattern, urlParts.searchParams);
  if (!query.ok) return query;

  return {
    ok: true,
    value: { params: params.value, query: query.value },
  };
}

function encodeRoutePath(
  pattern: NormalizedRoutePattern,
  params: RoutePatternParams,
): string {
  assertParamKeysMatchPattern(pattern, params);
  const pathSegments: string[] = [];

  for (const segment of pattern.segments) {
    if (segment.kind === "static") {
      pathSegments.push(encodeURIComponent(segment.value));
      continue;
    }

    const value = params[segment.name];
    if (segment.kind === "param") {
      if (typeof value !== "string") {
        throw new Error(
          `Invalid route pattern param ${segment.name}: expected string.`,
        );
      }
      pathSegments.push(encodePathSegment(segment.name, value));
      continue;
    }

    if (!isStringArray(value)) {
      throw new Error(
        `Invalid route pattern param ${segment.name}: expected string array.`,
      );
    }
    for (const item of value)
      pathSegments.push(encodePathSegment(segment.name, item));
  }

  return `/${pathSegments.join("/")}`;
}

function decodeRoutePath(
  pattern: NormalizedRoutePattern,
  pathSegments: readonly string[],
): Result<RoutePatternParams, 400 | 404> {
  const params: RoutePatternParams = {};
  let index = 0;

  for (const segment of pattern.segments) {
    if (segment.kind === "splat") {
      const value = decodePathSegments(pathSegments.slice(index));
      if (!value.ok) return value;
      params[segment.name] = value.value;
      index = pathSegments.length;
      break;
    }

    if (index >= pathSegments.length) return toRouteMismatch();

    const raw = pathSegments[index];
    const decoded = decodePathSegment(raw);
    if (!decoded.ok) return decoded;

    if (segment.kind === "static") {
      if (decoded.value !== segment.value) return toRouteMismatch();
    } else {
      params[segment.name] = decoded.value;
    }
    index += 1;
  }

  if (index !== pathSegments.length) return toRouteMismatch();

  return { ok: true, value: params };
}

function encodeQuery(
  pattern: NormalizedRoutePattern,
  rawQuery: unknown,
): string {
  if (!pattern.query) {
    if (rawQuery === undefined) return "";
    if (isPlainObject(rawQuery) && Object.keys(rawQuery).length === 0)
      return "";
    throw new Error("Route pattern does not declare query params.");
  }

  const parsed = Value.Parse(pattern.query, rawQuery ?? {});
  if (!isPlainObject(parsed)) {
    throw new Error("Route pattern query must parse to an object.");
  }

  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(parsed)) {
    if (value === undefined) continue;
    if (typeof value !== "string") {
      throw new Error(`Invalid route pattern query ${key}: expected string.`);
    }
    search.set(key, value);
  }

  const encoded = search.toString();
  return encoded ? `?${encoded}` : "";
}

function decodeQuery(
  pattern: NormalizedRoutePattern,
  search: URLSearchParams,
): Result<unknown, 400> {
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

  if (!pattern.query) {
    if (Object.keys(raw).length === 0) return { ok: true, value: {} };
    return {
      ok: false,
      status: 400,
      reason: "Route pattern does not declare query params.",
    };
  }

  try {
    return { ok: true, value: Value.Parse(pattern.query, raw) };
  } catch {
    return {
      ok: false,
      status: 400,
      reason: "Invalid route pattern query.",
    };
  }
}

function assertParamKeysMatchPattern(
  pattern: NormalizedRoutePattern,
  params: RoutePatternParams,
): void {
  const expected = new Set<string>();
  for (const segment of pattern.segments) {
    if (segment.kind !== "static") expected.add(segment.name);
  }
  for (const key of Object.keys(params)) {
    if (!expected.has(key))
      throw new Error(`Unexpected route pattern param: ${key}.`);
  }
  for (const key of expected) {
    if (!Object.prototype.hasOwnProperty.call(params, key)) {
      throw new Error(`Missing route pattern param: ${key}.`);
    }
  }
}

function encodePathSegment(name: string, value: string): string {
  if (value === "" || value.includes("/")) {
    throw new Error(
      `Invalid route pattern param ${name}: expected non-empty path segment.`,
    );
  }
  return encodeURIComponent(value);
}

function decodePathSegments(
  segments: readonly string[],
): Result<readonly string[], 400> {
  const decoded: string[] = [];
  for (const segment of segments) {
    const value = decodePathSegment(segment);
    if (!value.ok) return value;
    decoded.push(value.value);
  }
  return { ok: true, value: decoded };
}

function decodePathSegment(segment: string): Result<string, 400> {
  try {
    return { ok: true, value: decodeURIComponent(segment) };
  } catch {
    return {
      ok: false,
      status: 400,
      reason: "Malformed route pattern path segment.",
    };
  }
}

function decodeRouteLiteral(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    throw new Error(`Invalid route pattern segment: ${segment}.`);
  }
}

function toRouteMismatch(): Result<never, 404> {
  return {
    ok: false,
    status: 404,
    reason: "Route pattern did not match.",
  };
}

function toPathSegments(pathname: string): readonly string[] {
  return pathname.split("/").filter((segment) => segment !== "");
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStringArray(value: unknown): value is readonly string[] {
  return (
    Array.isArray(value) && value.every((item) => typeof item === "string")
  );
}
