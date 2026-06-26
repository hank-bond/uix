// canvas private state contributions.
//
// Canvas tools mutate the latest document store during a run. This contribution
// snapshots the relevant canvases at UIX turn boundaries and returns resource
// refs for the substrate-owned `uix.turn-state` entry.

import type { PreparedState, StateContribution } from "#backend/state/registry";

import type { CanvasContext } from "../context";

export function createCanvasStateContributions(
  ctx: CanvasContext,
): readonly StateContribution[] {
  const { buffer, openCanvasKeys, agentChangedCanvasKeys } = ctx;
  return [
    {
      id: "canvas",
      prepareUserSubmitState: async () =>
        snapshotCanvasPanes(buffer, openCanvasKeys),
      prepareAgentEndState: async () => {
        if (agentChangedCanvasKeys.size === 0) return undefined;
        const prepared = await snapshotCanvasPanes(
          buffer,
          new Set([...openCanvasKeys, ...agentChangedCanvasKeys]),
        );
        agentChangedCanvasKeys.clear();
        return prepared;
      },
    },
  ];
}

async function snapshotCanvasPanes(
  buffer: CanvasContext["buffer"],
  canvasKeys: Iterable<string>,
): Promise<PreparedState | undefined> {
  const versions = await buffer.snapshotCurrent(canvasKeys);
  if (versions.size === 0) return undefined;
  return {
    state: Object.fromEntries(
      [...versions].map(([canvasKey, version]) => [
        canvasResourceId(canvasKey),
        version.id,
      ]),
    ),
  };
}

function canvasResourceId(canvasKey: string): string {
  return `doc://canvas/${canvasKey}`;
}
