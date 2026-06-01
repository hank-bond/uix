// UIX cockpit — hardcoded Stage-1 canvas pane.
//
// TODO: hardcoded pane — becomes a registered iframe pane when the pane host +
// registerPane contribution land.

import { useEffect, useState } from "react";

import { canvasUrl } from "../shared/canvas";

export interface CanvasProps {
  canvasKey: string;
}

export function Canvas({ canvasKey }: CanvasProps) {
  const [token, setToken] = useState(0);

  useEffect(() => {
    return window.uix.onCanvasChanged((event) => {
      if (event.key === canvasKey) {
        setToken((prev) => prev + 1);
      }
    });
  }, [canvasKey]);

  return (
    <iframe
      className="canvas-frame"
      src={canvasUrl(canvasKey, token)}
      title={`canvas ${canvasKey}`}
      // allow-scripts + allow-same-origin is safe here because the iframe's
      // origin is the canvas's own custom-protocol origin, not the cockpit's.
      // The canvas origin holds no privileged window.uix bridge or cockpit DOM.
      sandbox="allow-scripts allow-same-origin"
    />
  );
}
