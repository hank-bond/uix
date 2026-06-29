// shared canvas addressing helpers.
//
// Canvas documents are addressed by keys, not filesystem paths. Keys are
// slash-namespaced lowercase slug segments. Transport URL construction is owned
// by the substrate resource route codec; canvas only maps its domain key to the
// route params for the canvas document resource.

import { Type } from "typebox";
import { Value } from "typebox/value";

import {
  createResourceAddressBuilder,
  type ResourceRouteParamValue,
  type ResourceUrl,
} from "@uix/api/resources";

declare const CanvasKeyBrand: unique symbol;
export type CanvasKey = string & { readonly [CanvasKeyBrand]: true };

export const CanvasResourceName = "doc";

const CanvasKeyPattern = /^[a-z0-9-]+(?:\/[a-z0-9-]+)*$/;

export const CanvasKeySchema = Type.Unsafe<CanvasKey>(
  Type.String({ pattern: CanvasKeyPattern.source }),
);

export function parseCanvasKey(value: unknown): CanvasKey {
  return Value.Parse(CanvasKeySchema, value);
}

export const CanvasKeyDescription =
  "lowercase slug segments [a-z0-9-]+ optionally separated by /";

// v is mostly just used for cache busting so the browser knows it needs to
// make a fresh web request to reload the iframe
export const CanvasResourceQuerySchema = Type.Object({
  v: Type.Optional(Type.String()),
});

const canvasResourceAddress = createResourceAddressBuilder({
  featureId: "canvas",
  name: CanvasResourceName,
  path: "/:key*",
  query: CanvasResourceQuerySchema,
  origin: "feature",
});

/** Normalized route for the resource contribution. */
export const CanvasResourceRoute = canvasResourceAddress.route;

export function parseCanvasKeyRouteParam(
  value: ResourceRouteParamValue | undefined,
): CanvasKey | null {
  if (!Array.isArray(value)) return null;
  try {
    return parseCanvasKey(value.join("/"));
  } catch {
    return null;
  }
}

export function toResourceUrl(
  workspaceId: string,
  key: CanvasKey,
  token?: number,
): ResourceUrl {
  return canvasResourceAddress.url({
    workspaceId,
    params: { key: key.split("/") },
    query: token === undefined ? {} : { v: String(token) },
  });
}

export function toResourceOrigin(workspaceId: string): string {
  return canvasResourceAddress.origin(workspaceId);
}
