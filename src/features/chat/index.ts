// chat feature entry.
//
// Chat is a renderer-only feature: it contributes one surface over the
// substrate-owned agent channels (prompt/history/event) and nothing else.
// The surface ref resolves against this file's directory, which is also
// the feature root the pipeline serves CSS/assets from.

import type { FeatureDefinition } from "@uix/api/feature";

import { chatSettings } from "./shared/settings";

const feature: FeatureDefinition = {
  id: "chat",
  settings: chatSettings,
  contribute: () => ({
    surfaces: ["./workspace/surface.tsx"],
  }),
};

export default feature;
