// Canvas surface contribution.

import { defineSurface } from "@uix/api/workspace";

import { Canvas } from "./Canvas";
import { parseCanvasKey } from "../shared/addressing";
import { canvasChannels } from "../shared/channels";

export const surface = defineSurface({
  name: "canvas",
  contract: canvasChannels,
  render: (client) => (
    <Canvas canvasKey={parseCanvasKey("main")} client={client} />
  ),
});
