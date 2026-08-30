// Derives the current transcript, model, and restorable feature state from one selected Pi branch.

import type { SessionEntry } from "@earendil-works/pi-coding-agent";

import type { ModelRef, TranscriptSnapshot } from "@uix/api/agent-channels";

import { createTranscriptProjector } from "./transcript";
import {
  asTurnStateEntryData,
  createTurnStateProjector,
  type TurnStateAsOfLeaf,
  type TurnStateRegistrySnapshot,
} from "../turn-state";

export interface SelectedBranchProjection {
  readonly transcript: TranscriptSnapshot;
  readonly turnStateAsOfLeaf: TurnStateAsOfLeaf;
  readonly model: ModelRef | undefined;
}

/** Derive the read models owned by the selected branch in one forward pass. */
export function deriveSelectedBranchProjection(
  branch: readonly SessionEntry[],
  initialCwd: string,
  turnStateRegistrySnapshot?: TurnStateRegistrySnapshot,
): SelectedBranchProjection {
  const transcriptProjector = createTranscriptProjector();
  const turnStateProjector = createTurnStateProjector(
    turnStateRegistrySnapshot,
    initialCwd,
  );
  let cwd = initialCwd;
  let model: ModelRef | undefined;

  for (const entry of branch) {
    cwd = asTurnStateEntryData(entry)?.cwd ?? cwd;
    if (entry.type === "model_change") {
      model = { provider: entry.provider, id: entry.modelId };
    }
    transcriptProjector.projectEntry(entry, cwd);
    turnStateProjector.projectEntry(entry);
  }

  return {
    transcript: transcriptProjector.deriveSnapshot(),
    turnStateAsOfLeaf: turnStateProjector.deriveAsOfLeaf(),
    model,
  };
}
