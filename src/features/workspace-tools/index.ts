// Default workspace-tool feature.
//
// This feature intentionally has no surface. It replaces Pi's baseline read
// and write definitions with reason-bearing wrappers; any conversation surface
// may progressively enhance those calls without depending on this provider.

import { defineFeature } from "@uix/api/feature";

import { createFileToolOverrideContributions } from "./backend/agent-tools";

const feature = defineFeature({
  id: "workspace_tools",
  contribute: () => ({
    agentToolOverrides: createFileToolOverrideContributions(),
  }),
});

export default feature;
