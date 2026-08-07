// the chat feature's settings scope.

import { type Static, Type } from "typebox";

import { defineSettings } from "@uix/api/settings";

export const ChatStatusBarSettingsSchema = Type.Object({
  order: Type.Array(Type.String()),
  hidden: Type.Array(Type.String()),
});
export type ChatStatusBarSettings = Static<typeof ChatStatusBarSettingsSchema>;

export const CommandLayoutSchema = Type.Union([
  Type.Literal("literal"),
  Type.Literal("structured"),
]);
export type CommandLayout = Static<typeof CommandLayoutSchema>;

export const BlockPresentationSettingsSchema = Type.Object({
  command: Type.Object({
    layout: CommandLayoutSchema,
  }),
});
export type BlockPresentationSettings = Static<
  typeof BlockPresentationSettingsSchema
>;

export const defaultBlockPresentationSettings: BlockPresentationSettings = {
  command: {
    layout: "literal",
  },
};

export const chatSettings = defineSettings({
  schema: Type.Object({
    statusBar: ChatStatusBarSettingsSchema,
    blockPresentation: BlockPresentationSettingsSchema,
  }),
  default: {
    statusBar: {
      order: ["model"],
      hidden: [],
    },
    blockPresentation: defaultBlockPresentationSettings,
  },
});
