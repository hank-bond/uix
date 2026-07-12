import type { FeatureDefinition } from "@uix/api/feature";

import { createCanvasContext, type CanvasContext } from "../context";
import { CanvasAgentSystemPrompt } from "./agent-system-prompt";
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
      agentSystemPrompt: CanvasAgentSystemPrompt,
      agentSkills: ["./skills/canvas-authoring"],
      turnState: createCanvasTurnStateContributions(ctx),
      agentContext: createCanvasAgentContextContributions(ctx),
      // Resolved against the feature entry file's dir (the feature root,
      // src/features/canvas), not this file's.
      surfaces: ["./workspace/surface.tsx"],
    };
  },
};
