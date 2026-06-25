// shared canvas addressing helpers.
//
// Canvas documents are addressed by keys, not filesystem paths. Keys are
// slash-namespaced lowercase slug segments. The custom protocol needs the full
// key to participate in the URL origin, so slash segments are reversed into
// host labels: reports/security-review -> security-review.reports.

import { Type } from "typebox";
import { Value } from "typebox/value";

declare const CanvasKeyBrand: unique symbol;
export type CanvasKey = string & { readonly [CanvasKeyBrand]: true };

export const CanvasProtocolScheme = "uix-canvas";

const CanvasKeyPattern = /^[a-z0-9-]+(?:\/[a-z0-9-]+)*$/;

export const CanvasKeySchema = Type.Unsafe<CanvasKey>(
  Type.String({ pattern: CanvasKeyPattern.source }),
);

export function parseCanvasKey(value: unknown): CanvasKey {
  return Value.Parse(CanvasKeySchema, value);
}

export const CanvasKeyDescription =
  "lowercase slug segments [a-z0-9-]+ optionally separated by /";

export function canvasKeyToHost(key: CanvasKey): string {
  return key.split("/").reverse().join(".");
}

export function canvasHostToKey(host: string): CanvasKey | null {
  if (!host) return null;
  const key = host.toLowerCase().split(".").reverse().join("/");
  return CanvasKeyPattern.test(key) ? (key as CanvasKey) : null;
}

export function canvasUrl(key: CanvasKey, token?: number): string {
  const query = token === undefined ? "" : `?v=${token}`;
  return `${CanvasProtocolScheme}://${canvasKeyToHost(key)}/${query}`;
}
