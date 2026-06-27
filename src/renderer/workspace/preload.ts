import type { AgentEvent, PromptRequest, UIXBridge } from "#shared/ipc";
import { channelCanonicalId } from "#shared/channel-normalization";
import {
  CanvasChangedSchema,
  type CanvasWriteback,
} from "#features/canvas/shared/channels";
import { Value } from "typebox/value";
import { AgentEvents, AgentRequests } from "./agent";
import type { WorkspaceClient } from "@uix/api/workspace";

// Temporary adapter for the pre-Workspace-iframe path. The current renderer can
// still access the preload bridge directly; once Workspace runs in a Host-owned
// iframe, WorkspaceClient will be backed by postMessage instead and Host will
// keep the preload access on its side of the bridge.
export const UixRequests = {
  reload: "uix.reload",
} as const;

const CanvasChannels = {
  writeback: channelCanonicalId("canvas", "writeback"),
  changed: channelCanonicalId("canvas", "changed"),
} as const;

export function createPreloadWorkspaceClient(
  bridge: UIXBridge,
): WorkspaceClient {
  return {
    request<Req, Res>(name: string, req: Req): Promise<Res> {
      switch (name) {
        case AgentRequests.prompt:
          return bridge.sendPrompt(req as PromptRequest) as Promise<Res>;
        case AgentRequests.history:
          return bridge.getHistory() as Promise<Res>;
        case UixRequests.reload:
          return bridge.reload() as Promise<Res>;
        case CanvasChannels.writeback:
          return bridge.writebackCanvas(req as CanvasWriteback) as Promise<Res>;
        default:
          return Promise.reject(
            new Error(`Unknown workspace request: ${name}`),
          );
      }
    },
    subscribe<Event>(
      name: string,
      handler: (event: Event) => void,
    ): () => void {
      switch (name) {
        case AgentEvents.event:
          return bridge.onAgentEvent(handler as (event: AgentEvent) => void);
        case CanvasChannels.changed:
          return bridge.onCanvasChanged((event) => {
            handler(Value.Parse(CanvasChangedSchema, event) as Event);
          });
        default:
          throw new Error(`Unknown workspace event: ${name}`);
      }
    },
  };
}
