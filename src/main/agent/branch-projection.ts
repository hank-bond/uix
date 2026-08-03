import type { SessionEntry } from "@earendil-works/pi-coding-agent";

import type { TranscriptSnapshot } from "@uix/api/agent-channels";

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
}

/** Derives the read models owned by the selected branch in one forward pass. */
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

  for (const entry of branch) {
    cwd = asTurnStateEntryData(entry)?.cwd ?? cwd;
    transcriptProjector.projectEntry(entry, cwd);
    turnStateProjector.projectEntry(entry);
  }

  return {
    transcript: transcriptProjector.deriveSnapshot(),
    turnStateAsOfLeaf: turnStateProjector.deriveAsOfLeaf(),
  };
}
