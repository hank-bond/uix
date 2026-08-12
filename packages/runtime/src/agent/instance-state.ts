// Owns the mutable collaborators and projections scoped to one live agent instance.

import type { AgentEvent, ModelRef } from "@uix/api/agent-channels";

import type { AgentInstaller } from "./installers";
import {
  createEphemeralTranscriptItemIdSequence,
  type EphemeralTranscriptItemIdSequence,
} from "./transcript";
import {
  createTranscriptObserver,
  type TranscriptObserver,
} from "./transcript-observer";
import {
  createTurnStateCoordinator,
  type TurnStateCoordinator,
} from "./turn-state-coordinator";
import { DisposableBag } from "../lifecycle";
import type { TurnStateRegistry } from "../turn-state";

export interface AgentInstanceState extends Disposable {
  readonly transcriptObserver: TranscriptObserver;
  readonly turnStateCoordinator: TurnStateCoordinator | undefined;
  readonly ephemeralTranscriptIds: EphemeralTranscriptItemIdSequence;
  readonly modelInstaller: AgentInstaller;
  getCurrentModel(): ModelRef | undefined;
  setCurrentModel(model: ModelRef | undefined): void;
}

interface AgentInstanceStateOptions {
  readonly emit: (event: AgentEvent) => void;
  readonly turnState?: TurnStateRegistry;
  readonly cwd: string;
  readonly onCurrentModelChange?: () => void;
}

/** Creates the mutable state owned by one agent at one branch viewpoint. */
export function createAgentInstanceState(
  opts: AgentInstanceStateOptions,
): AgentInstanceState {
  const bag = new DisposableBag();
  const ephemeralTranscriptIds = createEphemeralTranscriptItemIdSequence();
  const transcriptObserver = bag.add(
    createTranscriptObserver({
      emit: opts.emit,
      ephemeralIds: ephemeralTranscriptIds,
    }),
  );
  const turnStateCoordinator = opts.turnState
    ? bag.add(
        createTurnStateCoordinator({
          registry: opts.turnState,
          cwd: opts.cwd,
        }),
      )
    : undefined;
  let currentModel: ModelRef | undefined;
  let disposed = false;

  function setCurrentModel(model: ModelRef | undefined): void {
    if (disposed) throw new Error("Agent instance state is disposed");
    currentModel = model;
  }

  return {
    transcriptObserver,
    turnStateCoordinator,
    ephemeralTranscriptIds,
    modelInstaller(pi) {
      pi.on("model_select", (event) => {
        setCurrentModel({
          provider: event.model.provider,
          id: event.model.id,
        });
        opts.onCurrentModelChange?.();
      });
    },
    getCurrentModel: () => currentModel,
    setCurrentModel,
    [Symbol.dispose]() {
      if (disposed) return;
      disposed = true;
      currentModel = undefined;
      bag[Symbol.dispose]();
    },
  };
}
