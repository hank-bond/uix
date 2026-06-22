import { assertCanvasKey } from "../../../shared/canvas";
import type { FeatureContributions } from "../../features/contributions";
import type { FeatureContext } from "../../features/context";

import { CanvasDocumentBuffer } from "../document-buffer";

import { createCanvasAgentToolContributions } from "./agent-tools";
import { createCanvasChannelContributions } from "./channels";
import { createCanvasStateContributions } from "./state";
import { createCanvasStateMessageContributions } from "./state-messages";

export function createCanvasContributions(
  ctx: FeatureContext,
): FeatureContributions {
  const documents = ctx.documents.createStore({
    namespace: "canvas",
    extension: "html",
    validateDocumentId: assertCanvasKey,
  });
  const buffer = new CanvasDocumentBuffer(documents);
  const openCanvasKeys = ["main"];
  const agentChangedCanvasKeys = new Set<string>();

  return {
    id: "canvas",
    channels: createCanvasChannelContributions(
      { channels: ctx.channels },
      buffer,
    ),
    agentTools: createCanvasAgentToolContributions(
      { channels: ctx.channels },
      buffer,
      agentChangedCanvasKeys,
    ),
    state: createCanvasStateContributions(
      buffer,
      openCanvasKeys,
      agentChangedCanvasKeys,
    ),
    stateMessages: createCanvasStateMessageContributions(
      buffer,
      openCanvasKeys,
    ),
  };
}
