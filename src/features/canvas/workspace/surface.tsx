// canvas surface contribution.

import { Canvas } from "./Canvas";
import { parseCanvasKey } from "../shared/addressing";
import { canvasChannels } from "../shared/channels";
import { defineSurface } from "@uix/api/workspace";

export default defineSurface({
  name: "canvas",
  contract: canvasChannels,
  render: (client) => (
    <Canvas canvasKey={parseCanvasKey("main")} client={client} />
  ),
});
