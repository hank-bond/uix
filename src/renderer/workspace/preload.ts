import type { UIXBridge } from "#shared/ipc";
import type { WorkspaceClient } from "@uix/api/workspace";

// Temporary adapter for the pre-Workspace-iframe path. The current renderer can
// still access the preload bridge directly; once Workspace runs in a Host-owned
// iframe, WorkspaceClient will be backed by postMessage instead and Host will
// keep the preload access on its side of the bridge.
export const LocalWorkspaceId = "local";

export const UixRequests = {
  reload: "uix.reload",
} as const;

export function createPreloadWorkspaceClient(
  bridge: UIXBridge,
): WorkspaceClient {
  return {
    workspaceId: LocalWorkspaceId,
    request<Req, Res>(name: string, req: Req): Promise<Res> {
      return bridge.request(name, req) as Promise<Res>;
    },
    subscribe<Event>(
      name: string,
      handler: (event: Event) => void,
    ): () => void {
      return bridge.subscribe(name, handler as (payload: unknown) => void);
    },
  };
}
