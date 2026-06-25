import type { CanvasChanged, CanvasWriteback } from "../../../shared/ipc";
import type { FeatureChannelClient } from "../../../renderer/workspace/client";
import { CanvasChannelNames } from "./channels";

export interface CanvasClient {
  refresh(req: CanvasChanged): Promise<void>;
  writeback(req: CanvasWriteback): Promise<void>;
  onChanged(handler: (event: CanvasChanged) => void): () => void;
}

export function createCanvasClient(
  feature: FeatureChannelClient,
): CanvasClient {
  return {
    refresh(req: CanvasChanged) {
      return feature.request<CanvasChanged, void>(
        CanvasChannelNames.refresh,
        req,
      );
    },
    writeback(req: CanvasWriteback) {
      return feature.request<CanvasWriteback, void>(
        CanvasChannelNames.writeback,
        req,
      );
    },
    onChanged(handler: (event: CanvasChanged) => void) {
      return feature.subscribe(CanvasChannelNames.changed, handler);
    },
  };
}
