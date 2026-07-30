// Default workspace-tool feature.
//
// This feature intentionally has no surface. It provides reason-bearing
// workspace operations; any conversation surface may progressively enhance
// those calls without depending on this provider.

import { defineFeature } from "@uix/api/feature";

import { createWorkspaceToolOverrideContributions } from "./backend/agent-tools";

const feature = defineFeature({
  id: "workspace_tools",
  contribute: () => ({
    agentToolOverrides: createWorkspaceToolOverrideContributions(),
  }),
});

export default feature;
