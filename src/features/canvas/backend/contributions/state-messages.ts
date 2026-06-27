// canvas model-visible state-message contributions.

import { Type } from "typebox";

import type { StateMessageContribution } from "#backend/agent/state-messages";
import { createLogger } from "#backend/log";

import { formatCanvasChanges } from "../anchored-format";
import type { CanvasContext } from "../context";

export function createCanvasStateMessageContributions(
  ctx: CanvasContext,
): readonly StateMessageContribution[] {
  const { buffer, openCanvasKeys } = ctx;
  return [
    {
      name: "pane-visibility",
      description:
        'JSON `{"canvases_open": [...]}` — the canvas keys currently open in the pane. Sent only when the set changes. Keys are not filesystem paths; read contents with canvas__anchor_read when relevant.',
      buffer: {
        kind: "update",
        schema: Type.Object({ canvases_open: Type.Array(Type.String()) }),
      },
      initialValue: { canvases_open: [...openCanvasKeys].sort() },
    },
    {
      name: "canvas-diff",
      description:
        "anchored hunks the human edited in open canvases since your last turn, grouped by `## <canvas key>`. The anchors shown are current.",
      materialize: async () => {
        const changes = await buffer.consumeChanges();
        if (changes.size === 0) return undefined;
        const content = formatCanvasChanges(changes);
        // Human edits are conversation content (level policy: chat-visible is
        // info), even though the message itself is display-hidden.
        createLogger("canvas").info({ diff: content }, "canvas_diff");
        return { content, details: { changes: Object.fromEntries(changes) } };
      },
    },
  ];
}
