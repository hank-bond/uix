import type {
  FeatureContributions,
  FeatureDefinition,
} from "#backend/features/contributions";

import { createCanvasContext, type CanvasContext } from "../context";
import { createCanvasAgentToolContributions } from "./agent-tools";
import { createCanvasChannelContributions } from "./channels";
import {
  canvasResourceScheme,
  createCanvasResourceContributions,
} from "./resources";
import { createCanvasStateContributions } from "./state";
import { createCanvasStateMessageContributions } from "./state-messages";

export const canvasFeature: FeatureDefinition<CanvasContext> = {
  id: "canvas",
  preflight: {
    resourceSchemes: [canvasResourceScheme],
  },
  context: createCanvasContext,
  contribute(ctx) {
    return {
      id: "canvas",
      resources: createCanvasResourceContributions(ctx),
      channels: createCanvasChannelContributions(ctx),
      agentTools: createCanvasAgentToolContributions(ctx),
      state: createCanvasStateContributions(ctx),
      stateMessages: createCanvasStateMessageContributions(ctx),
    };
  },
};
