// canvas private state contributions.
//
// The documents cell stores immutable version refs for the canvases that make
// up the current branch state. The buffer owns resolving those refs back into
// mutable content and exact anchor state.

import { Type } from "typebox";

import {
  defineTurnStateCell,
  type TurnStateContributions,
} from "@uix/api/turn-state";

import {
  CanvasDocumentResourceIdSchema,
  parseCanvasDocumentResourceId,
  parseCanvasKey,
  parseCanvasKeyFromDocumentResourceId,
  toCanvasDocumentResourceId,
} from "../../shared/addressing";
import type { CanvasContext } from "../context";
import { publishCanvasChanged } from "./channels";

const CanvasDocumentsStateSchema = Type.Record(
  CanvasDocumentResourceIdSchema,
  Type.String(),
);

export function createCanvasTurnStateContributions(
  ctx: CanvasContext,
): TurnStateContributions {
  const { buffer } = ctx;
  return {
    documents: defineTurnStateCell({
      schema: CanvasDocumentsStateSchema,
      createSnapshot: async () => {
        const versions = await buffer.createSnapshots(
          buffer.listLoadedDocumentIds(),
        );
        return Object.fromEntries(
          [...versions].map(([canvasKey, version]) => [
            toCanvasDocumentResourceId(parseCanvasKey(canvasKey)),
            version.id,
          ]),
        );
      },
      restore: async (state) => {
        const versions = new Map(
          Object.entries(state ?? {}).map(([resourceId, versionId]) => [
            parseCanvasKeyFromDocumentResourceId(
              parseCanvasDocumentResourceId(resourceId),
            ),
            versionId,
          ]),
        );
        const affectedKeys = await buffer.restoreVersions(versions);
        for (const key of affectedKeys) {
          publishCanvasChanged(ctx, parseCanvasKey(key));
        }
      },
    }),
  };
}
