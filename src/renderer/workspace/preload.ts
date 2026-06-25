import type {
  AgentEvent,
  CanvasChanged,
  CanvasWriteback,
  PromptRequest,
  UIXBridge,
} from "../../shared/ipc";
import {
  CanvasEventAddresses,
  CanvasRequestAddresses,
} from "../../features/canvas/workspace/channels";
import { AgentEvents, AgentRequests } from "./agent";
import type { WorkspaceClient } from "@uix/api/workspace";

// Temporary adapter for the pre-Workspace-iframe path. The current renderer can
// still access the preload bridge directly; once Workspace runs in a Host-owned
// iframe, WorkspaceClient will be backed by postMessage instead and Host will
// keep the preload access on its side of the bridge.
export const UixRequests = {
  reload: "uix.reload",
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
        case CanvasRequestAddresses.refresh:
          return bridge.refreshCanvas(req as CanvasChanged) as Promise<Res>;
        case CanvasRequestAddresses.writeback:
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
        case CanvasEventAddresses.changed:
          return bridge.onCanvasChanged(
            handler as (event: CanvasChanged) => void,
          );
        default:
          throw new Error(`Unknown workspace event: ${name}`);
      }
    },
  };
}
