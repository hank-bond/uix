// Defines the Canvas Workspace surface and per-Agent behavior.

import { defineFeature } from "@uix/api/feature";

import { createCanvasAgentContextContributions } from "./agent-context";
import { CanvasAgentSystemPrompt } from "./agent-system-prompt";
import { createCanvasAgentToolContributions } from "./agent-tools";
import { createCanvasChannelContributions } from "./channels";
import { createCanvasFrameResourceContributions } from "./resources";
import { createCanvasTurnStateContributions } from "./turn-state";
import { canvasChannels } from "../../shared/channels";
import { createCanvasContext } from "../context";

export const canvasFeature = defineFeature({
  id: "canvas",
  workspace(ctx) {
    return {
      resources: createCanvasFrameResourceContributions(ctx),
      agentChannelContracts: [canvasChannels],
      // Resolved against the feature entry file's dir (the feature root,
      // src/features/canvas), not this file's.
      surfaces: ["./workspace/surface.tsx"],
    };
  },
  agent(baseContext) {
    const ctx = createCanvasContext(baseContext);
    return {
      channels: createCanvasChannelContributions(ctx),
      agentTools: createCanvasAgentToolContributions(ctx),
      agentSystemPrompt: CanvasAgentSystemPrompt,
      agentSkills: ["./skills/canvas-authoring"],
      turnState: createCanvasTurnStateContributions(ctx),
      agentContext: createCanvasAgentContextContributions(ctx),
      [Symbol.dispose]: () => {
        ctx.buffer[Symbol.dispose]();
      },
    };
  },
});
