import type { FeatureDefinition } from "@uix/api/feature";

import { createCanvasContext, type CanvasContext } from "../context";
import { createCanvasAgentToolContributions } from "./agent-tools";
import { createCanvasChannelContributions } from "./channels";
import { createCanvasResourceContributions } from "./resources";
import { createCanvasTurnStateContributions } from "./turn-state";
import { createCanvasAgentContextContributions } from "./agent-context";

export const canvasFeature: FeatureDefinition<CanvasContext> = {
  id: "canvas",
  context: createCanvasContext,
  contribute(ctx) {
    return {
      resources: createCanvasResourceContributions(ctx),
      channels: createCanvasChannelContributions(ctx),
      agentTools: createCanvasAgentToolContributions(ctx),
      turnState: createCanvasTurnStateContributions(ctx),
      agentContext: createCanvasAgentContextContributions(ctx),
    };
  },
};
