// The workspace-tools feature providing reason-bearing base tools for conversation surfaces.
//
// This feature intentionally has no surface. It provides reason-bearing
// workspace operations. Any conversation surface may progressively enhance
// those calls without depending on this provider.

import { defineFeature } from "@uix/api/feature";

import { createWorkspaceToolContributions } from "./backend/agent-tools";

export const feature = defineFeature({
  id: "workspace_tools",
  contribute: () => ({
    agentTools: createWorkspaceToolContributions(),
  }),
});
