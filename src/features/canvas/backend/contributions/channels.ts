// canvas channel contributions.

import { createLogger } from "#backend/log";
import type { CanvasKey } from "../../shared/addressing";
import type {
  ChannelContribution,
  FeatureChannelPublisher,
} from "@uix/api/channels";
import { Type } from "typebox";
import {
  CanvasChangedSchema,
  CanvasWritebackSchema,
  type CanvasChanged,
  type CanvasWriteback,
} from "../../shared/channels";

import type { CanvasContext } from "../context";

export function publishCanvasChanged(
  channels: FeatureChannelPublisher,
  key: CanvasKey,
): void {
  createLogger("canvas").debug({ key }, "canvas_changed");
  channels.publish("changed", { key } satisfies CanvasChanged);
}

export function createCanvasChannelContributions(
  ctx: CanvasContext,
): readonly ChannelContribution[] {
  return [
    {
      requests: {
        writeback: {
          request: CanvasWritebackSchema,
          response: Type.Void(),
          async handle(req) {
            const payload = req as CanvasWriteback;
            createLogger("canvas").debug(
              { key: payload.key, bytes: payload.html.length },
              "canvas_writeback",
            );
            // No broadcast: the pane already shows the human's edit, and the
            // channel pulls from the canvas document buffer on its next turn.
            await ctx.buffer.writeback(payload.key, payload.html);
          },
        },
      },
      events: {
        changed: {
          event: CanvasChangedSchema,
        },
      },
    },
  ];
}
