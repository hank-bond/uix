// Adapts the Electron preload transport to the shared workspace client contract.
//
// The workspace runs directly in the BrowserWindow. No iframe, no sandbox.
// Multi-workspace isolation comes from separate BrowserWindows.

import type { WorkspaceClient } from "@uix/api/workspace";
import type { ChannelTransport } from "#shared/ipc";

const LocalWorkspaceId = "local";

export function createElectronWorkspaceClient(
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
