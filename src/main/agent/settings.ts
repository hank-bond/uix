// Substrate-owned `agent` workspace settings namespace.
//
// Lives in the manifest's top-level `settings.agent` object. Registered
// through the workspace settings facade before any feature loads, so a
// feature id colliding with the namespace fails on the registry's
// duplicate-scope check.

import { defineSettings } from "@uix/api/settings";
import { Type } from "typebox";

export const AgentSettingsNamespace = "agent";

export const ModelRefSchema = Type.Object({
  provider: Type.String(),
  id: Type.String(),
});

export const agentWorkspaceSettings = defineSettings({
  /**
   * Workspace default model: used before a pi session exists and as the
   * default for new sessions/branches without a `model_change` entry.
   * Optional — absent until the pilot first selects a model.
   */
  defaultModel: {
    schema: ModelRefSchema,
  },
});
