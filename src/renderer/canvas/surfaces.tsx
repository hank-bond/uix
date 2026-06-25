// canvas renderer surface contributions.

import { Canvas } from "../Canvas";
import type { SurfaceContribution } from "../surfaces/registry";

export function createCanvasSurfaceContributions(): readonly SurfaceContribution[] {
  return [
    {
      id: "canvas.main",
      title: "canvas",
      renderer: {
        kind: "shadow",
        render: () => (
          <div className="surface__body surface__body--canvas">
            <Canvas canvasKey="main" />
          </div>
        ),
      },
    },
  ];
}
