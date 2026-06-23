// UIX cockpit — bundled default features.
//
// This is the current synchronous feature inventory. Keeping it outside the
// composition root lets main/index.ts consume "features" without naming canvas;
// later package/discovery loading replaces this module's implementation.

import { canvasFeature } from "../canvas/contributions";

import type { FeatureDefinition } from "./contributions";

export function getBundledFeatures(): readonly FeatureDefinition[] {
  return [canvasFeature];
}
