// hardcoded Stage-1 canvas pane.
//
// TODO: hardcoded pane — becomes a registered iframe pane when the pane host +
// registerPane contribution land.

import { useEffect, useState } from "react";

import {
  CanvasProtocolScheme,
  canvasKeyToHost,
  canvasUrl,
} from "../shared/canvas";

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

  useEffect(() => {
    // The shim postMessages human edits up from the sandboxed canvas frame.
    // Trust only this canvas's own origin and its own key.
    const origin = `${CanvasProtocolScheme}://${canvasKeyToHost(canvasKey)}`;
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== origin) return;
      const msg = event.data as { type?: string; key?: string; html?: string };
      if (msg?.type !== "uix:canvas-writeback" || msg.key !== canvasKey) return;
      // Guard against a malformed message blanking the stored canvas.
      if (typeof msg.html !== "string" || msg.html === "") return;
      void window.uix.writebackCanvas({ key: canvasKey, html: msg.html });
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
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
