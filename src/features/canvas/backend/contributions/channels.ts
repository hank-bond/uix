// canvas channel contributions.

import { createLogger } from "#backend/log";
import type { CanvasKey } from "../../shared/addressing";
import type { ChannelContribution } from "@uix/api/channels";
import { withHandlers } from "@uix/api/channels";
import {
  canvasChannels,
  type CanvasEventPublisher,
} from "../../shared/channels";

import type { CanvasContext } from "../context";

export function publishCanvasChanged(
  events: CanvasEventPublisher,
  key: CanvasKey,
): void {
  createLogger("canvas").debug({ key }, "canvas_changed");
  events.changed({ key });
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
