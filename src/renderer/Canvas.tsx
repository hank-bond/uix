// hardcoded Stage-1 canvas surface.
//
// TODO: hardcoded surface — becomes a registered Workspace surface once surface
// contributions land.

import { useEffect, useMemo, useState } from "react";

import {
  CanvasProtocolScheme,
  canvasKeyToHost,
  canvasUrl,
} from "../shared/canvas";
import {
  createCanvasClient,
  type CanvasClient,
} from "../features/canvas/workspace/client";
import { createFeatureChannelClient } from "@uix/api/workspace";
import { useWorkspaceClient } from "./workspace/context";

export interface CanvasProps {
  canvasKey: string;
}

export function Canvas({ canvasKey }: CanvasProps) {
  const canvas = useCanvasClient();
  const [token, setToken] = useState(0);

  useEffect(() => {
    return canvas.onChanged((event) => {
      if (event.key === canvasKey) {
        setToken((prev) => prev + 1);
      }
    });
  }, [canvas, canvasKey]);

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
      void canvas.writeback({ key: canvasKey, html: msg.html });
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [canvas, canvasKey]);

  return (
    <iframe
      className="canvas-frame"
      src={canvasUrl(canvasKey, token)}
      title={`canvas ${canvasKey}`}
      // allow-scripts + allow-same-origin is safe here because the iframe's
      // origin is the canvas's own custom-protocol origin, not the host's.
      // The canvas origin holds no privileged window.uix bridge or host DOM.
      sandbox="allow-scripts allow-same-origin"
    />
  );
}

function useCanvasClient(): CanvasClient {
  const workspace = useWorkspaceClient();
  return useMemo(() => {
    const feature = createFeatureChannelClient(workspace, "canvas");
    return createCanvasClient(feature);
  }, [workspace]);
}
