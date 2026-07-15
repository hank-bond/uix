// Substrate-owned `agent` workspace settings namespace.
//
// Lives in the manifest's top-level `settings.agent` object. Registered
// through the workspace settings facade before any feature loads, so a
// feature id colliding with the namespace fails on the registry's
// duplicate-scope check.

import { ModelRefSchema } from "@uix/api/agent-channels";
import { Type } from "typebox";
import { defineSettings } from "@uix/api/settings";

export const AgentSettingsNamespace = "agent";

export const agentWorkspaceSettings = defineSettings({
  schema: Type.Object({
    /**
     * Workspace default model: used before a pi session exists and as the
     * default for new sessions/branches without a `model_change` entry.
     * Optional — absent until the pilot first selects a model.
     */
    defaultModel: Type.Optional(ModelRefSchema),
    /** Workspace-local shortlist; unavailable entries remain for reconnects. */
    favoriteModels: Type.Optional(Type.Array(ModelRefSchema)),
  }),
});
