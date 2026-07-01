// canvas surface contribution.

import { Canvas } from "./Canvas";
import { parseCanvasKey } from "../shared/addressing";
import type { SurfaceLayout } from "../../../renderer/workspace/layout";

export const canvasSurface: SurfaceLayout = {
  name: "canvas",
  render: () => <Canvas canvasKey={parseCanvasKey("main")} />,
};
