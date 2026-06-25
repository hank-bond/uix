// canvas model-visible state-message contributions.

import { Type } from "typebox";

import type { StateMessageContribution } from "../../../../main/agent/state-messages";
import { createLogger } from "../../../../main/log";

import { formatCanvasChanges } from "../anchored-format";
import { CanvasDocumentBuffer } from "../document-buffer";

export function createCanvasStateMessageContributions(
  buffer: CanvasDocumentBuffer,
  openCanvasKeys: readonly string[],
): readonly StateMessageContribution[] {
  return [
    {
      messageType: "uix.pane-visibility",
      description:
        'JSON `{"canvases_open": [...]}` — the canvas keys currently open in the pane. Sent only when the set changes. Keys are not filesystem paths; read contents with canvas__anchor_read when relevant.',
      buffer: {
        kind: "update",
        schema: Type.Object({ canvases_open: Type.Array(Type.String()) }),
      },
      initialValue: { canvases_open: [...openCanvasKeys].sort() },
    },
    {
      messageType: "uix.canvas-diff",
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
