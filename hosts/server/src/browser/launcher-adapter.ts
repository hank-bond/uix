// Adapts the public workspace catalog to launcher listing and canonical browser navigation.

import type { LauncherAdapter } from "@uix/client/launcher";
import {
  parseWorkspaceCatalog,
  type WorkspaceCatalog,
} from "@uix/host/catalog";

interface ServerLauncherAdapterOptions {
  readCatalog(): Promise<unknown>;
  setLocation(location: string): void;
}

/** Construct the read-only launcher capabilities for one server page. */
export function createServerLauncherAdapter(
  options: ServerLauncherAdapterOptions,
): LauncherAdapter {
  let catalogRequest: Promise<WorkspaceCatalog> | undefined;
  const readCatalog = (): Promise<WorkspaceCatalog> => {
    catalogRequest ??= options.readCatalog().then(parseWorkspaceCatalog);
    return catalogRequest;
  };

  return {
    async listWorkspaces() {
      const catalog = await readCatalog();
      return catalog.workspaces.map(({ id, name }) => ({ id, name }));
    },
    async openWorkspace(workspaceId) {
      const catalog = await readCatalog();
      const workspace = catalog.workspaces.find(
        (entry) => entry.id === workspaceId,
      );
      if (!workspace) throw new Error(`Unknown workspace: ${workspaceId}`);
      options.setLocation(workspace.location);
      return "accepted";
    },
  };
}
