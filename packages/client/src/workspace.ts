// Mounts the shared workspace page over a host-constructed channel client.

import "./workspace/workspace.css";

import { createElement, StrictMode } from "react";
import { createRoot } from "react-dom/client";

import {
  type WorkspaceClient,
  WorkspaceClientProvider,
} from "@uix/api/workspace";

import { installSurfaceSharedModules } from "./workspace/surface-shared-modules";
import { Workspace } from "./workspace/Workspace";

export interface WorkspaceClientMountOptions {
  /** Dedicated, initially empty page element owned by this mount. */
  readonly target: HTMLElement;
  readonly client: WorkspaceClient;
  /** Idempotently reflects an accepted session in the host's location. */
  readonly synchronizeSessionLocation?: (sessionId: string) => void;
}

/** Mount the workspace and return its idempotent page-lifetime capability. */
export function mountWorkspaceClient({
  target,
  client,
  synchronizeSessionLocation,
}: WorkspaceClientMountOptions): Disposable {
  installSurfaceSharedModules();
  const root = createRoot(target);
  root.render(
    createElement(
      StrictMode,
      null,
      createElement(WorkspaceClientProvider, {
        client,
        children: createElement(Workspace, { synchronizeSessionLocation }),
      }),
    ),
  );

  let disposed = false;
  return {
    [Symbol.dispose](): void {
      if (disposed) return;
      disposed = true;
      root.unmount();
    },
  };
}
