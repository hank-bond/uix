// canvas channel contributions.

import { createLogger } from "#backend/log";
import type { CanvasKey } from "../../shared/addressing";
import type {
  ChannelContribution,
  FeatureChannelPublisher,
} from "@uix/api/channels";
import { withHandlers } from "@uix/api/channels";
import { canvasChannels, type CanvasChanged } from "../../shared/channels";

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
    withHandlers(canvasChannels, {
      writeback: {
        async handle(req) {
          createLogger("canvas").debug(
            { key: req.key, bytes: req.html.length },
            "canvas_writeback",
          );
          // No broadcast: the pane already shows the human's edit, and the
          // channel pulls from the canvas document buffer on its next turn.
          await ctx.buffer.writeback(req.key, req.html);
        },
      },
    }),
  ];
}
