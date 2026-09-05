// Defines validated, host-neutral physical feature-directory URLs.

import { Type } from "typebox";
import { Value } from "typebox/value";

const FeatureWebRootUrlBrand: unique symbol = Symbol("FeatureWebRootUrl");
const FeatureWebRootUrlInputSchema = Type.String();

/**
 * An absolute directory URL without a query or fragment, in browser-normalized form.
 */
export type FeatureWebRootUrl = string & {
  readonly [FeatureWebRootUrlBrand]: true;
};

/**
 * Validate a physical feature root and return its browser-normalized string.
 * Relative, opaque, and non-directory URLs fail rather than receiving an added slash.
 * Scheme selection and binding encoding remain host responsibilities.
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
