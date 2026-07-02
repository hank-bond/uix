// canvas channel contributions.

import type { CanvasKey } from "../../shared/addressing";
import type { ChannelContribution } from "@uix/api/channels";
import { withHandlers } from "@uix/api/channels";
import { canvasChannels } from "../../shared/channels";

import type { CanvasContext } from "../context";

export function publishCanvasChanged(ctx: CanvasContext, key: CanvasKey): void {
  ctx.log.debug({ key }, "canvas_changed");
  ctx.events.changed({ key });
}

export function createCanvasChannelContributions(
  ctx: CanvasContext,
): readonly ChannelContribution[] {
  return [
    withHandlers(canvasChannels, {
      writeback: {
        async handle(req) {
          ctx.log.debug(
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
