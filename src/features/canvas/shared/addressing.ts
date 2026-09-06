// Parses Canvas keys and maps them to durable document ids.

import { Type } from "typebox";
import { Value } from "typebox/value";

declare const CanvasKeyBrand: unique symbol;
export type CanvasKey = string & { readonly [CanvasKeyBrand]: true };

declare const CanvasDocumentResourceIdBrand: unique symbol;
export type CanvasDocumentResourceId = string & {
  readonly [CanvasDocumentResourceIdBrand]: true;
};

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
