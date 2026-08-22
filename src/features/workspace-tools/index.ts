// The workspace-tools feature providing reason-bearing tool overrides for conversation surfaces.
//
// This feature intentionally has no surface. It provides reason-bearing
// workspace operations. Any conversation surface may progressively enhance
// those calls without depending on this provider.

import { defineFeature } from "@uix/api/feature";

import { createWorkspaceToolOverrideContributions } from "./backend/agent-tools";

export const feature = defineFeature({
  id: "workspace_tools",
  agent: () => ({
    agentToolOverrides: createWorkspaceToolOverrideContributions(),
  }),
});
