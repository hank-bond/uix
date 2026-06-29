import type { FeatureDefinition } from "#backend/features/contributions";

import { createCanvasContext, type CanvasContext } from "../context";
import { createCanvasAgentToolContributions } from "./agent-tools";
import { createCanvasChannelContributions } from "./channels";
import { createCanvasResourceContributions } from "./resources";
import { createCanvasStateContributions } from "./state";
import { createCanvasStateMessageContributions } from "./state-messages";

export const canvasFeature: FeatureDefinition<CanvasContext> = {
  id: "canvas",
  context: createCanvasContext,
  contribute(ctx) {
    return {
      resources: createCanvasResourceContributions(ctx),
      channels: createCanvasChannelContributions(ctx),
      agentTools: createCanvasAgentToolContributions(ctx),
      state: createCanvasStateContributions(ctx),
      stateMessages: createCanvasStateMessageContributions(ctx),
    };
  },
};
