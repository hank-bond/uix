// The chat feature's settings scope.

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

/** Which args a tool surfaces in its collapsed summary. */
export const ToolParamVisibilitySchema = Type.Object({
  /** Arg keys shown collapsed. Absent entry = show all surfaceable params. */
  collapsed: Type.Array(Type.String()),
});
export type ToolParamVisibility = Static<typeof ToolParamVisibilitySchema>;

export const BlockPresentationSettingsSchema = Type.Object({
  command: Type.Object({
    layout: CommandLayoutSchema,
  }),
  /** Per-tool collapsed-param visibility. Absent tool = show all params. */
  toolParams: Type.Record(Type.String(), ToolParamVisibilitySchema),
});
export type BlockPresentationSettings = Static<
  typeof BlockPresentationSettingsSchema
>;

export const defaultBlockPresentationSettings: BlockPresentationSettings = {
  command: {
    layout: "literal",
  },
  toolParams: {},
};

/**
 * One tool's persisted collapsed-param visibility. Absent entry = show every
 * surfaceable param (the chat default).
 */
export function toolParamVisibility(
  settings: BlockPresentationSettings,
  toolName: string,
): ToolParamVisibility | undefined {
  return settings.toolParams[toolName];
}

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
