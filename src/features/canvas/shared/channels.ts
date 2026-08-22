// The canvas channel contract: writeback requests and change events.

import { type Static, Type } from "typebox";

import type { ChannelContract, FeatureEventPublisher } from "@uix/api/channels";

import { CanvasKeySchema } from "./addressing";

export const CanvasChangedSchema = Type.Object({
  key: CanvasKeySchema,
});
export type CanvasChanged = Static<typeof CanvasChangedSchema>;

export const CanvasReadSchema = Type.Object({
  key: CanvasKeySchema,
});
export type CanvasRead = Static<typeof CanvasReadSchema>;

export const CanvasWritebackSchema = Type.Object({
  key: CanvasKeySchema,
  html: Type.String(),
});
export type CanvasWriteback = Static<typeof CanvasWritebackSchema>;

export const canvasChannels = {
  feature: "canvas",
  requests: {
    read: {
      requestSchema: CanvasReadSchema,
      responseSchema: Type.String(),
    },
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
} as const satisfies ChannelContract;

export type CanvasEventPublisher = FeatureEventPublisher<typeof canvasChannels>;
