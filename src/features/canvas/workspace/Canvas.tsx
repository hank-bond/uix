// canvas surface.
//
// Renders agent-authored HTML from the document store in a sandboxed iframe.
// Human edits flow back to the store via postMessage writeback.
// The channel client is provided by the surface host via props.

import { useEffect, useRef, useState } from "react";

import {
  toResourceOrigin,
  toResourceUrl,
  type CanvasKey,
} from "../shared/addressing";
import type { ChannelClient } from "@uix/api/workspace";
import { canvasChannels } from "../shared/channels";
import { useWorkspaceClient } from "../../../renderer/workspace/context";

export interface CanvasProps {
  canvasKey: CanvasKey;
  client: ChannelClient<typeof canvasChannels>;
}

export function Canvas({ canvasKey, client }: CanvasProps) {
  const workspace = useWorkspaceClient();
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [token, setToken] = useState(0);

  useEffect(() => {
    return client.subscriptions.changed((event) => {
      if (event.key === canvasKey) {
        setToken((prev) => prev + 1);
      }
    });
  }, [client, canvasKey]);

  useEffect(() => {
    // The shim postMessages human edits up from the sandboxed canvas frame.
    // Trust only this feature's isolated origin, this exact iframe window, and
    // this canvas key. The origin is feature-scoped rather than per-document.
    const origin = toResourceOrigin(workspace.workspaceId);
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== origin) return;
      if (event.source !== frameRef.current?.contentWindow) return;
      const msg = event.data as { type?: string; key?: string; html?: string };
      if (msg?.type !== "uix:canvas-writeback" || msg.key !== canvasKey) return;
      // Guard against a malformed message blanking the stored canvas.
      if (typeof msg.html !== "string" || msg.html === "") return;
      void client.requests.writeback({ key: canvasKey, html: msg.html });
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [client, canvasKey, workspace.workspaceId]);

  return (
    <iframe
      ref={frameRef}
      className="canvas-frame"
      src={toResourceUrl(workspace.workspaceId, canvasKey, token)}
      title={`canvas ${canvasKey}`}
      // allow-scripts + allow-same-origin is safe here because the iframe's
      // origin is the canvas's own custom-protocol origin (uix-resource://),
      // not the workspace's. The canvas origin has no access to window.channels
      // or the workspace DOM.
      sandbox="allow-scripts allow-same-origin"
    />
  );
}
