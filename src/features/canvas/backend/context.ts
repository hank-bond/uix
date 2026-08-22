// Canvas state created separately for each AgentInstance.

import type { DocumentStore } from "@uix/api/documents";
import type { AgentFeatureContext } from "@uix/api/feature";

import { CanvasDocumentBuffer } from "./document-buffer";
import { parseCanvasKey } from "../shared/addressing";
import { canvasChannels, type CanvasEventPublisher } from "../shared/channels";

export type CanvasContext = AgentFeatureContext & {
  store: DocumentStore;
  buffer: CanvasDocumentBuffer;
  events: CanvasEventPublisher;
};

export function createCanvasContext(ctx: AgentFeatureContext): CanvasContext {
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
