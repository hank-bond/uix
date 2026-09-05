// Validated directory addresses for feature web routes, independent of host scheme.

import { Type } from "typebox";
import { Value } from "typebox/value";

const FeatureWebRootUrlBrand: unique symbol = Symbol("FeatureWebRootUrl");
const FeatureWebRootUrlInputSchema = Type.String();

/**
 * An absolute directory address in browser-normalized form, without a query or fragment.
 */
export type FeatureWebRootUrl = string & {
  readonly [FeatureWebRootUrlBrand]: true;
};

/**
 * Validate a physical feature root and return its browser-normalized string.
 * Reject relative, opaque, and non-directory addresses rather than adding a trailing slash.
 * Each host selects the scheme and encodes the binding.
 */
export function parseFeatureWebRootUrl(value: unknown): FeatureWebRootUrl {
  Value.Assert(FeatureWebRootUrlInputSchema, value);
  const root = new URL(value);
  if (
    root.search !== "" ||
    root.hash !== "" ||
    new URL(".", root).href !== root.href
  ) {
    throw new Error(
      `Invalid web route feature root: ${value}. Expected a directory URL without query or fragment.`,
    );
  }
  return root.href as FeatureWebRootUrl;
}
