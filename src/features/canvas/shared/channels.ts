import { Type, type Static } from "typebox";

import { CanvasKeySchema } from "./addressing";

export const CanvasChangedSchema = Type.Object({
  key: CanvasKeySchema,
});
export type CanvasChanged = Static<typeof CanvasChangedSchema>;

export const CanvasWritebackSchema = Type.Object({
  key: CanvasKeySchema,
  html: Type.String(),
});
export type CanvasWriteback = Static<typeof CanvasWritebackSchema>;

export const canvasChannels = {
  requests: {
    writeback: {
      requestSchema: CanvasWritebackSchema,
      responseSchema: Type.Void(),
    },
  },
  events: {
    changed: {
      event: CanvasChangedSchema,
    },
  },
} as const;
