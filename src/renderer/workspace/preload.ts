// workspace client backed by the preload channel transport (window.channels).
//
// The workspace runs directly in the BrowserWindow — no iframe, no sandbox.
// Multi-workspace isolation comes from separate BrowserWindows.

import type { WorkspaceClient } from "@uix/api/workspace";
import type { ChannelTransport } from "#shared/ipc";

export const LocalWorkspaceId = "local";

export function createPreloadWorkspaceClient(
  transport: ChannelTransport,
): WorkspaceClient {
  return {
    workspaceId: LocalWorkspaceId,
    request(channel: string, req: unknown): Promise<unknown> {
      return transport.request(channel, req);
    },
    subscribe(channel: string, handler: (event: unknown) => void): () => void {
      return transport.subscribe(channel, handler);
    },
  };
}
