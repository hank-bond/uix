import { KeybindingMapSchema } from "@uix/api/actions";
import { defineWorkspaceSettingsNamespace } from "../workspace-settings-namespace";

export const keybindingsWorkspaceSettings = defineWorkspaceSettingsNamespace({
  id: "keybindings",
  schema: KeybindingMapSchema,
  default: {},
});
