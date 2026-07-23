// canvas model-visible agent-context contributions.

import type { AgentContextContribution } from "@uix/api/agent-context";
import type { AnchoredChange } from "../anchors/document";

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
  const { buffer } = ctx;
  return [
    {
      name: "canvas-diff",
      description:
        "anchored hunks the human edited in canvases since your last turn, grouped by `## <canvas key>`. The anchors shown are current.",
      materialize: async (agentContext) => {
        const [current, previous] = agentContext.turnStates<CanvasTurnState>(
          "documents",
          { limit: 2 },
        );
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
        ctx.log.info({ diff: content }, "canvas_diff");
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
