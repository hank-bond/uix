import type { ChannelPublisher } from "../../channels/registry";
import type { FeatureContributions } from "../../features/contributions";

import { CanvasDocumentBuffer } from "../document-buffer";

import { createCanvasAgentToolContributions } from "./agent-tools";
import { createCanvasChannelContributions } from "./channels";
import { createCanvasStateContributions } from "./state";
import { createCanvasStateMessageContributions } from "./state-messages";

export interface CanvasContributionOptions {
  buffer: CanvasDocumentBuffer;
  openCanvasKeys: readonly string[];
  agentChangedCanvasKeys: Set<string>;
  channels: ChannelPublisher;
}

export function createCanvasContributions(
  opts: CanvasContributionOptions,
): FeatureContributions {
  return {
    id: "canvas",
    channels: createCanvasChannelContributions(
      { channels: opts.channels },
      opts.buffer,
    ),
    agentTools: createCanvasAgentToolContributions(
      { channels: opts.channels },
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
