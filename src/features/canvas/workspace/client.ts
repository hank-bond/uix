import type { FeatureChannelClient } from "@uix/api/workspace";
import type { CanvasChanged, CanvasWriteback } from "../shared/channels";

export interface CanvasClient {
  writeback(req: CanvasWriteback): Promise<void>;
  onChanged(handler: (event: CanvasChanged) => void): () => void;
}

export function createCanvasClient(
  feature: FeatureChannelClient,
): CanvasClient {
  return {
    writeback(req: CanvasWriteback) {
      return feature.request("writeback", req);
    },
    onChanged(handler: (event: CanvasChanged) => void) {
      return feature.subscribe("changed", handler);
    },
  };
}
