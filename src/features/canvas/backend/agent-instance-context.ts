// The per-Agent Canvas feature context with its document store, working buffer, and event publisher.

import type { DocumentStore } from "@uix/api/documents";
import type { AgentFeatureContext } from "@uix/api/feature";

import { CanvasDocumentBuffer } from "./document-buffer";
import { parseCanvasKey } from "../shared/addressing";
import { canvasChannels, type CanvasEventPublisher } from "../shared/channels";

export type CanvasAgentInstanceContext = AgentFeatureContext & {
  store: DocumentStore;
  buffer: CanvasDocumentBuffer;
  events: CanvasEventPublisher;
};

export function createCanvasAgentInstanceContext(
  ctx: AgentFeatureContext,
): CanvasAgentInstanceContext {
  const store = ctx.documents.createStore({
    namespace: "canvas",
    extension: "html",
    validateDocumentId: (documentId) => {
      parseCanvasKey(documentId);
    },
  });
  return {
    ...ctx,
    store,
    buffer: new CanvasDocumentBuffer(store),
    events: ctx.channels.createPublisher(canvasChannels),
  };
}
