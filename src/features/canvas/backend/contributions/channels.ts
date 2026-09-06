// Canvas channel contributions.

import type { ChannelContribution } from "@uix/api/channels";
import { withHandlers } from "@uix/api/channels";

import type { CanvasKey } from "../../shared/addressing";
import { canvasChannels } from "../../shared/channels";
import type { CanvasAgentInstanceContext } from "../agent-instance-context";

export function publishCanvasChanged(
  ctx: CanvasAgentInstanceContext,
  key: CanvasKey,
): void {
  ctx.log.debug({ key }, "canvas_changed");
  ctx.events.changed({ key });
}

export function createCanvasChannelContributions(
  ctx: CanvasAgentInstanceContext,
): readonly ChannelContribution[] {
  return [
    withHandlers(canvasChannels, {
      writeback: {
        async handler(req) {
          ctx.log.debug(
            { key: req.key, bytes: req.html.length },
            "canvas_writeback",
          );
          // No broadcast: the iframe already shows the human's edit.
          await ctx.buffer.writeback(req.key, req.html);
        },
      },
    }),
  ];
}
