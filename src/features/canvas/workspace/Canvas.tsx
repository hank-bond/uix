// Renders the selected Agent viewpoint's Canvas HTML in a feature-origin iframe.

import type { JSX } from "react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";

import type { agentChannels } from "@uix/api/agent-channels";
import {
  type ChannelClient,
  resolveWorkspaceResourceUrl,
  useWorkspaceClient,
  useWorkspaceSession,
} from "@uix/api/workspace";

import {
  forwardCanvasIframeMessage,
  isCanvasIframeReady,
  parseCanvasIframeMessage,
} from "./iframe-messages";
import {
  type CanvasKey,
  toCanvasIframeOrigin,
  toCanvasIframeUrl,
} from "../shared/addressing";
import type { canvasChannels } from "../shared/channels";

export interface CanvasProps {
  canvasKey: CanvasKey;
  client: ChannelClient<typeof canvasChannels>;
  agent: ChannelClient<typeof agentChannels>;
}

export function Canvas({ canvasKey, client, agent }: CanvasProps): JSX.Element {
  const workspace = useWorkspaceClient();
  const { sessionSelectionVersion } = useWorkspaceSession();
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const htmlRef = useRef("");
  const sessionSelectionVersionRef = useRef(sessionSelectionVersion);
  sessionSelectionVersionRef.current = sessionSelectionVersion;
  const [changeVersion, setChangeVersion] = useState(0);
  const [iframeVersion, setIframeVersion] = useState(0);

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
        setIframeVersion((previous) => previous + 1);
      })
      .catch(() => {
        if (!current) return;
        htmlRef.current = "";
        setIframeVersion((previous) => previous + 1);
      });
    return () => {
      current = false;
    };
  }, [client, canvasKey, changeVersion, sessionSelectionVersion]);

  useLayoutEffect(() => {
    const acceptedSessionSelectionVersion = sessionSelectionVersion;
    const isCurrentViewpoint = (): boolean =>
      sessionSelectionVersionRef.current === acceptedSessionSelectionVersion;
    const iframeOrigin = resolveWorkspaceResourceUrl(
      workspace,
      toCanvasIframeOrigin(workspace.workspaceId),
    );
    const onMessage = (event: MessageEvent): void => {
      if (!isCurrentViewpoint()) return;
      if (event.origin !== iframeOrigin) return;
      if (event.source !== iframeRef.current?.contentWindow) return;
      if (isCanvasIframeReady(event.data, canvasKey)) {
        iframeRef.current.contentWindow?.postMessage(
          { type: "canvas:load", key: canvasKey, html: htmlRef.current },
          iframeOrigin,
        );
        return;
      }
      const message = parseCanvasIframeMessage(event.data, canvasKey);
      if (!message) return;
      void forwardCanvasIframeMessage(
        message,
        isCurrentViewpoint,
        client.requests.writeback,
        agent.requests.prompt,
      );
    };
    window.addEventListener("message", onMessage);
    return () => {
      window.removeEventListener("message", onMessage);
    };
  }, [agent, client, canvasKey, sessionSelectionVersion, workspace]);

  return (
    <iframe
      key={`${String(sessionSelectionVersion)}:${String(iframeVersion)}`}
      ref={iframeRef}
      className="canvas-iframe"
      src={resolveWorkspaceResourceUrl(
        workspace,
        toCanvasIframeUrl(workspace.workspaceId, canvasKey, iframeVersion),
      )}
      title={`canvas ${canvasKey}`}
      sandbox="allow-scripts allow-same-origin"
    />
  );
}
