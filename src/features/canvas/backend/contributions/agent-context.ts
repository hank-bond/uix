// canvas model-visible agent-context contributions.

import { Type } from "typebox";

import type { AgentContextContribution } from "#backend/agent-context/registry";
import type { AnchoredChange } from "#backend/anchors/document";
import { createLogger } from "#backend/log";

import {
  parseCanvasKeyFromDocumentResourceId,
  parseCanvasDocumentResourceId,
} from "../../shared/addressing";
import { formatCanvasChanges } from "../anchored-format";
import type { CanvasContext } from "../context";

type CanvasTurnState = Record<string, string>;

export function createCanvasAgentContextContributions(
  ctx: CanvasContext,
): readonly AgentContextContribution[] {
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
      materialize: async (agentContext) => {
        const [current, previous] = agentContext.turnStates<CanvasTurnState>({
          limit: 2,
        });
        if (!current || !previous) return undefined;
        const changes = await diffCanvasTurnStates(
          buffer,
          previous.state,
          current.state,
        );
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

async function diffCanvasTurnStates(
  buffer: CanvasContext["buffer"],
  previous: CanvasTurnState,
  current: CanvasTurnState,
): Promise<ReadonlyMap<string, readonly AnchoredChange[]>> {
  const changes = new Map<string, readonly AnchoredChange[]>();
  for (const [resourceId, currentVersionId] of Object.entries(current)) {
    const previousVersionId = previous[resourceId];
    if (!previousVersionId) continue;
    const canvasKey = parseCanvasKeyFromResourceId(resourceId);
    if (!canvasKey) continue;
    const hunks = await buffer.diffVersions(
      canvasKey,
      previousVersionId,
      currentVersionId,
    );
    if (hunks.length) changes.set(canvasKey, hunks);
  }
  return changes;
}

function parseCanvasKeyFromResourceId(resourceId: string): string | undefined {
  try {
    return parseCanvasKeyFromDocumentResourceId(
      parseCanvasDocumentResourceId(resourceId),
    );
  } catch {
    return undefined;
  }
}
