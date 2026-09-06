// Defines the Canvas Workspace surface and per-Agent behavior.

import { defineFeature } from "@uix/api/feature";

import { createCanvasAgentContextContributions } from "./agent-context";
import { CanvasAgentSystemPrompt } from "./agent-system-prompt";
import { createCanvasAgentToolContributions } from "./agent-tools";
import { createCanvasChannelContributions } from "./channels";
import { createCanvasTurnStateContributions } from "./turn-state";
import { createCanvasWebRouteContributions } from "./web-routes";
import { canvasChannels } from "../../shared/channels";
import { CanvasDocumentRoute } from "../../shared/web-routes";
import { createCanvasAgentInstanceContext } from "../agent-instance-context";

export const canvasFeature = defineFeature({
  id: "canvas",
  workspace() {
    return {
      agentChannelContracts: [canvasChannels],
      viewpointWebRouteContracts: [CanvasDocumentRoute],
      // Resolved against the feature entry file's dir (the feature root,
      // src/features/canvas), not this file's.
      surfaces: ["./workspace/surface.tsx"],
    };
  },
  agent(baseContext) {
    const ctx = createCanvasAgentInstanceContext(baseContext);
    return {
      channels: createCanvasChannelContributions(ctx),
      webRoutes: createCanvasWebRouteContributions(ctx),
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
