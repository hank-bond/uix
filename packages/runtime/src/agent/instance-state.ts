// Owns the mutable collaborators and projections scoped to one live agent instance.

import type {
  AgentEvent,
  ModelRef,
  TranscriptSnapshot,
} from "@uix/api/agent-channels";

import { createCurrentTranscript } from "./current-transcript";
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

export interface AgentInstanceState {
  readonly transcriptObserver: TranscriptObserver;
  readonly turnStateCoordinator: TurnStateCoordinator | undefined;
  readonly ephemeralTranscriptIds: EphemeralTranscriptItemIdSequence;
  readonly modelInstaller: AgentInstaller;
  /** Materialize and publish one event through this instance's event path. */
  emitAgentEvent(event: AgentEvent): void;
  getTranscriptSnapshot(): TranscriptSnapshot;
  getCurrentModel(): ModelRef | undefined;
  setCurrentModel(model: ModelRef | undefined): void;
}

/** Ownership capability adding deterministic cleanup to operational state. */
export type AgentInstanceStateOwnership = AgentInstanceState & Disposable;

export interface AgentInstanceStateOptions {
  readonly emit: (event: AgentEvent) => void;
  readonly initialTranscript: TranscriptSnapshot;
  readonly turnState?: TurnStateRegistry;
  readonly cwd: string;
  readonly onCurrentModelChange?: () => void;
}

/** Creates the mutable state owned by one agent at one branch viewpoint. */
export function createAgentInstanceState(
  opts: AgentInstanceStateOptions,
): AgentInstanceStateOwnership {
  const bag = new DisposableBag();
  const ephemeralTranscriptIds = createEphemeralTranscriptItemIdSequence();
  const currentTranscript = createCurrentTranscript(opts.initialTranscript);
  function emitAgentEvent(event: AgentEvent): void {
    currentTranscript.apply(event);
    opts.emit(event);
  }
  const transcriptObserver = bag.add(
    createTranscriptObserver({
      emit: emitAgentEvent,
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
    currentModel = model;
  }

  return {
    transcriptObserver,
    turnStateCoordinator,
    ephemeralTranscriptIds,
    emitAgentEvent,
    getTranscriptSnapshot: () => currentTranscript.getSnapshot(),
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
