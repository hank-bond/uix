// Renders the selected Agent viewpoint's Canvas HTML in a feature-origin iframe.

import type { JSX } from "react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

import { agentChannels } from "@uix/api/agent-channels";
import {
  type ChannelClient,
  createChannelClient,
  useWorkspaceClient,
  useWorkspaceSession,
} from "@uix/api/workspace";

import {
  forwardCanvasFrameMessage,
  isCanvasFrameReady,
  parseCanvasFrameMessage,
} from "./frame-messages";
import {
  type CanvasKey,
  toCanvasFrameOrigin,
  toCanvasFrameUrl,
} from "../shared/addressing";
import type { canvasChannels } from "../shared/channels";

export interface CanvasProps {
  canvasKey: CanvasKey;
  client: ChannelClient<typeof canvasChannels>;
}

export function Canvas({ canvasKey, client }: CanvasProps): JSX.Element {
  const workspace = useWorkspaceClient();
  const { sessionSelectionVersion } = useWorkspaceSession();
  const agent = useMemo(
    () => createChannelClient(workspace, agentChannels),
    [workspace],
  );
  const frameRef = useRef<HTMLIFrameElement>(null);
  const htmlRef = useRef("");
  const [changeVersion, setChangeVersion] = useState(0);
  const [frameVersion, setFrameVersion] = useState(0);

  useEffect(() => {
    return client.events.changed((event) => {
      if (event.key === canvasKey) {
        setChangeVersion((previous) => previous + 1);
      }
    });
  }, [client, canvasKey]);

  useEffect(() => {
    let current = true;
    htmlRef.current = "";
    void client.requests
      .read({ key: canvasKey })
      .then((html) => {
        if (!current) return;
        htmlRef.current = html;
        setFrameVersion((previous) => previous + 1);
      })
      .catch(() => {
        if (!current) return;
        htmlRef.current = "";
        setFrameVersion((previous) => previous + 1);
      });
    return () => {
      current = false;
    };
  }, [client, canvasKey, changeVersion, sessionSelectionVersion]);

  useLayoutEffect(() => {
    const origin = toCanvasFrameOrigin(workspace.workspaceId);
    const onMessage = (event: MessageEvent): void => {
      if (event.origin !== origin) return;
      if (event.source !== frameRef.current?.contentWindow) return;
      if (isCanvasFrameReady(event.data, canvasKey)) {
        frameRef.current.contentWindow?.postMessage(
          { type: "canvas:load", key: canvasKey, html: htmlRef.current },
          origin,
        );
        return;
      }
      const message = parseCanvasFrameMessage(event.data, canvasKey);
      if (!message) return;
      void forwardCanvasFrameMessage(
        message,
        client.requests.writeback,
        agent.requests.prompt,
      );
    };
    window.addEventListener("message", onMessage);
    return () => {
      window.removeEventListener("message", onMessage);
    };
  }, [agent, client, canvasKey, workspace.workspaceId]);

  return (
    <iframe
      key={`${String(sessionSelectionVersion)}:${String(frameVersion)}`}
      ref={frameRef}
      className="canvas-frame"
      src={toCanvasFrameUrl(workspace.workspaceId, canvasKey, frameVersion)}
      title={`canvas ${canvasKey}`}
      sandbox="allow-scripts allow-same-origin"
    />
  );
}
