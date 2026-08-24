// Parses Canvas keys and maps them to durable document ids and frame routes.

import { Type } from "typebox";
import { Value } from "typebox/value";

import {
  createResourceAddressHandle,
  type ResourceRouteParamValue,
  type ResourceUrl,
} from "@uix/api/resources";

declare const CanvasKeyBrand: unique symbol;
export type CanvasKey = string & { readonly [CanvasKeyBrand]: true };

declare const CanvasDocumentResourceIdBrand: unique symbol;
export type CanvasDocumentResourceId = string & {
  readonly [CanvasDocumentResourceIdBrand]: true;
};

export const CanvasFrameResourceName = "frame";

const CanvasKeyPattern = /^[a-z0-9-]+(?:\/[a-z0-9-]+)*$/;
const CanvasDocumentResourceIdPrefix = "doc://canvas/";
const CanvasDocumentResourceIdPattern = new RegExp(
  `^${CanvasDocumentResourceIdPrefix}${CanvasKeyPattern.source.slice(1, -1)}$`,
);

export const CanvasKeySchema = Type.Unsafe<CanvasKey>(
  Type.String({ pattern: CanvasKeyPattern.source }),
);

export const CanvasDocumentResourceIdSchema =
  Type.Unsafe<CanvasDocumentResourceId>(
    Type.String({ pattern: CanvasDocumentResourceIdPattern.source }),
  );

export function parseCanvasKey(value: unknown): CanvasKey {
  return Value.Parse(CanvasKeySchema, value);
}

export function toCanvasDocumentResourceId(
  key: CanvasKey,
): CanvasDocumentResourceId {
  return `${CanvasDocumentResourceIdPrefix}${key}` as CanvasDocumentResourceId;
}

export function parseCanvasDocumentResourceId(
  value: unknown,
): CanvasDocumentResourceId {
  return Value.Parse(CanvasDocumentResourceIdSchema, value);
}

export function parseCanvasKeyFromDocumentResourceId(
  resourceId: CanvasDocumentResourceId,
): CanvasKey {
  return parseCanvasKey(
    resourceId.slice(CanvasDocumentResourceIdPrefix.length),
  );
}

export const CanvasKeyDescription =
  "lowercase slug segments [a-z0-9-]+ optionally separated by /";

export const CanvasFrameQuerySchema = Type.Object({
  v: Type.Optional(Type.String()),
});

const canvasFrameAddress = createResourceAddressHandle({
  featureId: "canvas",
  name: CanvasFrameResourceName,
  path: "/:key*",
  query: CanvasFrameQuerySchema,
  origin: "feature",
});

export const CanvasFrameResourceRoute = canvasFrameAddress.route;

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

export function toCanvasFrameUrl(
  workspaceId: string,
  key: CanvasKey,
  token: number,
): ResourceUrl {
  return canvasFrameAddress.toUrl({
    workspaceId,
    params: { key: key.split("/") },
    query: { v: String(token) },
  });
}

export function toCanvasFrameOrigin(workspaceId: string): string {
  return canvasFrameAddress.toOrigin(workspaceId);
}
