import { SessionIdSchema } from "@uix/api/agent-channels";
import { Type, type Static } from "typebox";

import { defineWorkspaceSettingsNamespace } from "../workspace-settings-namespace";

const SelectedSessionSettingSchema = Type.Object({
  sessionId: SessionIdSchema,
});
export type SelectedSessionSetting = Static<
  typeof SelectedSessionSettingSchema
>;

export const sessionWorkspaceSettings = defineWorkspaceSettingsNamespace({
  id: "session",
  schema: Type.Object({
    selected: Type.Optional(SelectedSessionSettingSchema),
  }),
});
