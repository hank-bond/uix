// UIX cockpit — canvas private state contribution.
//
// Canvas tools mutate the latest document store during a run. This contribution
// snapshots the relevant canvases at UIX turn boundaries and returns pane refs
// for the substrate-owned `uix.turn-state` entry.

import type { StateRegistry, PreparedState } from "../state/registry";

import { DocumentBuffer } from "./buffer";

export function registerCanvasState(
  state: StateRegistry,
  buffer: DocumentBuffer,
  openCanvasKeys: readonly string[],
  agentChangedCanvasKeys: Set<string>,
): Disposable {
  return state.register({
    id: "uix.canvas",
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
  });
}

async function snapshotCanvasPanes(
  buffer: DocumentBuffer,
  canvasKeys: Iterable<string>,
): Promise<PreparedState | undefined> {
  const versions = await buffer.snapshotCurrent(canvasKeys);
  if (versions.size === 0) return undefined;
  return {
    panes: Object.fromEntries(
      [...versions].map(([canvasKey, version]) => [
        canvasPaneId(canvasKey),
        version.id,
      ]),
    ),
  };
}

function canvasPaneId(canvasKey: string): string {
  return `canvas/${canvasKey}`;
}
