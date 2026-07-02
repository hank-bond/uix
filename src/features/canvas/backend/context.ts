// canvas feature-local context.
//
// Runs first among canvas contributions and is the only one whose order is
// guaranteed. Builds the shared object graph (document store, buffer, the
// open/agent-changed canvas key sets) that every facet factory pulls off the
// merged context bag. Keeping construction here (rather than inline in the
// feature's contribute wiring) gives the shared objects a single home and a
// single importable type, and keeps the import graph one-directional:
// context.ts depends only on substrate + the buffer; the facet factories
// depend on context.ts; the feature wiring depends on both.

import type { FeatureContext } from "#backend/features/context";
import type { DocumentStore } from "#backend/documents/store";

import { parseCanvasKey } from "../shared/addressing";
import { canvasChannels, type CanvasEventPublisher } from "../shared/channels";
import { CanvasDocumentBuffer } from "./document-buffer";

export type CanvasContext = FeatureContext & {
  store: DocumentStore;
  buffer: CanvasDocumentBuffer;
  events: CanvasEventPublisher;
  openCanvasKeys: readonly string[];
  agentChangedCanvasKeys: Set<string>;
};

export function createCanvasContext(ctx: FeatureContext): CanvasContext {
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
    openCanvasKeys: ["main"],
    agentChangedCanvasKeys: new Set<string>(),
  };
}
