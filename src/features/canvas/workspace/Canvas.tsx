// Loads the selected Canvas document directly and forwards iframe writeback and prompt actions.

import type { JSX } from "react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";

import type { agentChannels } from "@uix/api/agent-channels";
import {
  type ChannelClient,
  useWebRouteClient,
  useWorkspaceSession,
} from "@uix/api/workspace";

import {
  asCanvasIframeMessage,
  forwardCanvasIframeMessage,
} from "./iframe-messages";
import type { CanvasKey } from "../shared/addressing";
import type { canvasChannels } from "../shared/channels";
import { CanvasDocumentRoute } from "../shared/web-routes";

interface CanvasProps {
  canvasKey: CanvasKey;
  client: ChannelClient<typeof canvasChannels>;
  agent: ChannelClient<typeof agentChannels>;
}

export function Canvas({ canvasKey, client, agent }: CanvasProps): JSX.Element {
  const documentClient = useWebRouteClient(CanvasDocumentRoute);
  const documentUrl = documentClient.toUrl({ query: { key: canvasKey } });
  const { sessionSelectionVersion } = useWorkspaceSession();
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [changeVersion, setChangeVersion] = useState(0);

  useEffect(() => {
    return client.events.changed((event) => {
      if (event.key === canvasKey) {
        setChangeVersion((previous) => previous + 1);
      }
    });
  }, [client, canvasKey]);

  useLayoutEffect(() => {
    let isActive = true;
    const isCurrentViewpoint = (): boolean => isActive;
    const url = new URL(documentUrl);
    // Serialize the authority explicitly: URL.origin may report "null" for
    // a host's privileged custom scheme even though Chromium assigns an origin.
    const iframeOrigin = `${url.protocol}//${url.host}`;
    const messageHandler = (event: MessageEvent): void => {
      if (!isActive) return;
      if (event.origin !== iframeOrigin) return;
      if (event.source !== iframeRef.current?.contentWindow) return;
      const message = asCanvasIframeMessage(event.data, canvasKey);
      if (!message) return;
      void forwardCanvasIframeMessage(
        message,
        isCurrentViewpoint,
        client.requests.writeback,
        agent.requests.prompt,
      );
    };
    window.addEventListener("message", messageHandler);
    return () => {
      isActive = false;
      window.removeEventListener("message", messageHandler);
    };
  }, [
    agent,
    client,
    canvasKey,
    documentUrl,
    sessionSelectionVersion,
    changeVersion,
  ]);

  return (
    <iframe
      key={`${documentUrl}:${String(sessionSelectionVersion)}:${String(changeVersion)}`}
      ref={iframeRef}
      className="canvas-iframe"
      src={documentUrl}
      title={`canvas ${canvasKey}`}
      sandbox="allow-scripts allow-same-origin"
    />
  );
}
