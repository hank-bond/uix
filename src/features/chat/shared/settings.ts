import { Type, type Static } from "typebox";

import { defineSettings } from "@uix/api/settings";

export const ChatStatusBarSettingsSchema = Type.Object({
  order: Type.Array(Type.String()),
  hidden: Type.Array(Type.String()),
});
export type ChatStatusBarSettings = Static<typeof ChatStatusBarSettingsSchema>;

export const chatSettings = defineSettings({
  statusBar: {
    schema: ChatStatusBarSettingsSchema,
    default: {
      order: ["model"],
      hidden: [],
    },
  },
});
