// UIX cockpit — canvas channel contributions.

import {
  type CanvasChanged,
  type CanvasWriteback,
  Channels,
} from "../../../shared/ipc";
import { assertCanvasKey } from "../../../shared/canvas";
import type {
  ChannelContribution,
  ChannelPublisher,
} from "../../channels/registry";
import { createLogger } from "../../log";

import { CanvasDocumentBuffer } from "../document-buffer";

export interface CanvasChannelContributionOptions {
  channels: ChannelPublisher;
}

export function publishCanvasChanged(
  channels: ChannelPublisher,
  key: string,
): void {
  createLogger("canvas").debug({ key }, "canvas_changed");
  channels.publish(Channels.canvasChanged, { key } satisfies CanvasChanged);
}

export function createCanvasChannelContributions(
  opts: CanvasChannelContributionOptions,
  buffer: CanvasDocumentBuffer,
): readonly ChannelContribution[] {
  return [
    {
      id: "canvas.channel.refresh",
      channel: Channels.canvasRefresh,
      handle(req: unknown) {
        const payload = req as CanvasChanged;
        assertCanvasKey(payload.key);
        publishCanvasChanged(opts.channels, payload.key);
      },
    },
    {
      id: "canvas.channel.writeback",
      channel: Channels.canvasWriteback,
      async handle(req: unknown) {
        const payload = req as CanvasWriteback;
        assertCanvasKey(payload.key);
        createLogger("canvas").debug(
          { key: payload.key, bytes: payload.html.length },
          "canvas_writeback",
        );
        // No broadcast: the pane already shows the human's edit, and the
        // channel pulls from the canvas document buffer on its next turn.
        await buffer.writeback(payload.key, payload.html);
      },
    },
  ];
}
