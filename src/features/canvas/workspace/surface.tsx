// Canvas surface contribution.

import { agentChannels } from "@uix/api/agent-channels";
import { defineSurface } from "@uix/api/workspace";

import { Canvas } from "./Canvas";
import { parseCanvasKey } from "../shared/addressing";
import { canvasChannels } from "../shared/channels";

export const surface = defineSurface({
  name: "canvas",
  channels: {
    agent: agentChannels,
    canvas: canvasChannels,
  },
  render: ({ agent, canvas }) => (
    <Canvas canvasKey={parseCanvasKey("main")} client={canvas} agent={agent} />
  ),
});
