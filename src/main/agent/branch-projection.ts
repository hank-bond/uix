import type { SessionEntry } from "@earendil-works/pi-coding-agent";

import type { TranscriptSnapshot } from "@uix/api/agent-channels";
import {
  createTurnStateProjector,
  type TurnStateAsOfLeaf,
  type TurnStateRegistrySnapshot,
} from "../turn-state/registry";
import { createTranscriptProjector } from "./transcript";

export interface SelectedBranchProjection {
  readonly transcript: TranscriptSnapshot;
  readonly turnStateAsOfLeaf: TurnStateAsOfLeaf;
}

/** Derives the read models owned by the selected branch in one forward pass. */
export function deriveSelectedBranchProjection(
  branch: readonly SessionEntry[],
  turnStateRegistry?: TurnStateRegistrySnapshot,
): SelectedBranchProjection {
  const transcriptProjector = createTranscriptProjector();
  const turnStateProjector = createTurnStateProjector(turnStateRegistry);

  for (const entry of branch) {
    transcriptProjector.projectEntry(entry);
    turnStateProjector.projectEntry(entry);
  }

  return {
    transcript: transcriptProjector.deriveSnapshot(),
    turnStateAsOfLeaf: turnStateProjector.deriveAsOfLeaf(),
  };
}
