import { SessionIdSchema } from "@uix/api/agent-channels";
import { defineSettings } from "@uix/api/settings";
import { Type, type Static } from "typebox";

export const SessionSettingsNamespace = "session";

const SelectedSessionSettingSchema = Type.Object({
  sessionId: SessionIdSchema,
  displayLabel: Type.String(),
});
export type SelectedSessionSetting = Static<
  typeof SelectedSessionSettingSchema
>;

export const sessionWorkspaceSettings = defineSettings({
  schema: Type.Object({
    selected: Type.Optional(SelectedSessionSettingSchema),
  }),
});
