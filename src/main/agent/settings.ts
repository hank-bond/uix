// Defines workspace settings for the default model and favorite models.
//
// Lives in the manifest's top-level `settings.agent` object. Registered
// through the workspace settings facade before any feature loads, so a
// feature id colliding with the namespace fails on the registry's
// duplicate-scope check.

import { Type } from "typebox";

import { ModelRefSchema } from "@uix/api/agent-channels";

import { defineWorkspaceSettingsNamespace } from "../workspace/settings-namespace";

export const agentWorkspaceSettings = defineWorkspaceSettingsNamespace({
  id: "agent",
  schema: Type.Object({
    /**
     * Workspace default model: used before a Pi session exists and as the
     * default for new sessions/branches without a `model_change` entry.
     * Optional; absent until the user first selects a model.
     */
    defaultModel: Type.Optional(ModelRefSchema),
    /** Workspace-local shortlist; unavailable entries remain for reconnects. */
    favoriteModels: Type.Optional(Type.Array(ModelRefSchema)),
  }),
});
