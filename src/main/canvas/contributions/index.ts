import type { FeatureContributions } from "../../features/contributions";

import { CanvasDocumentBuffer } from "../document-buffer";

import { createCanvasAgentToolContributions } from "./agent-tools";
import { createCanvasStateContributions } from "./state";
import { createCanvasStateMessageContributions } from "./state-messages";

export interface CanvasContributionOptions {
  buffer: CanvasDocumentBuffer;
  openCanvasKeys: readonly string[];
  agentChangedCanvasKeys: Set<string>;
  onCanvasChanged: (key: string) => void;
}

export function createCanvasContributions(
  opts: CanvasContributionOptions,
): FeatureContributions {
  return {
    id: "canvas",
    agentTools: createCanvasAgentToolContributions(
      { onCanvasChanged: opts.onCanvasChanged },
      opts.buffer,
      opts.agentChangedCanvasKeys,
    ),
    state: createCanvasStateContributions(
      opts.buffer,
      opts.openCanvasKeys,
      opts.agentChangedCanvasKeys,
    ),
    stateMessages: createCanvasStateMessageContributions(
      opts.buffer,
      opts.openCanvasKeys,
    ),
  };
}
