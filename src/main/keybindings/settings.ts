// Defines the workspace settings group that persists user keybinding overrides.

import { KeybindingMapSchema } from "@uix/api/actions";

import { defineWorkspaceSettingsNamespace } from "../workspace/settings-namespace";

export const keybindingsWorkspaceSettings = defineWorkspaceSettingsNamespace({
  id: "keybindings",
  schema: KeybindingMapSchema,
  default: {},
});
