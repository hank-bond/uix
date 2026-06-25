// hardcoded Stage-1 canvas surface.
//
// TODO: hardcoded surface — becomes a registered Workspace surface once surface
// contributions land.

import { useEffect, useMemo, useState } from "react";

import {
  CanvasProtocolScheme,
  canvasKeyToHost,
  canvasUrl,
  type CanvasKey,
} from "../shared/addressing";
import { createCanvasClient, type CanvasClient } from "./client";
import {
  createFeatureChannelClient,
  type WorkspaceClient,
} from "@uix/api/workspace";

export interface CanvasProps {
  canvasKey: CanvasKey;
  workspace: WorkspaceClient;
}

export function Canvas({ canvasKey, workspace }: CanvasProps) {
  const canvas = useCanvasClient(workspace);
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

function useCanvasClient(workspace: WorkspaceClient): CanvasClient {
  return useMemo(() => {
    const feature = createFeatureChannelClient(workspace, "canvas");
    return createCanvasClient(feature);
  }, [workspace]);
}
