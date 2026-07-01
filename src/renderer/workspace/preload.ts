// workspace client backed by the preload channel transport (window.channels).
//
// The workspace runs directly in the BrowserWindow — no iframe, no sandbox.
// Multi-workspace isolation comes from separate BrowserWindows.

import type { ChannelTransport } from "#shared/ipc";
import type { WorkspaceClient } from "@uix/api/workspace";

export const LocalWorkspaceId = "local";

export function createPreloadWorkspaceClient(
  transport: ChannelTransport,
): WorkspaceClient {
  return {
    workspaceId: LocalWorkspaceId,
    request<Req, Res>(channel: string, req: Req): Promise<Res> {
      return transport.request(channel, req) as Promise<Res>;
    },
    subscribe<Event>(
      channel: string,
      handler: (event: Event) => void,
    ): () => void {
      return transport.subscribe(
        channel,
        handler as (payload: unknown) => void,
      );
    },
  };
}
