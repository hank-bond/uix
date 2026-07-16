import { KeybindingMapSchema } from "@uix/api/actions";
import { defineSettings } from "@uix/api/settings";

export const KeybindingsSettingsNamespace = "keybindings";

export const keybindingsWorkspaceSettings = defineSettings({
  schema: KeybindingMapSchema,
  default: {},
});
