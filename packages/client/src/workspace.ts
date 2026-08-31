// Mounts the shared workspace page over host-constructed client capabilities.

import "./workspace/workspace.css";

import { createElement, StrictMode } from "react";
import { createRoot } from "react-dom/client";

import {
  type WorkspaceClient,
  WorkspaceClientProvider,
} from "@uix/api/workspace";

import type { ActionInvocationSource } from "./workspace/action-invocation-source";
import { installSurfaceSharedModules } from "./workspace/surface-shared-modules";
import { Workspace } from "./workspace/Workspace";

export type { ActionInvocationSource } from "./workspace/action-invocation-source";

export interface WorkspaceClientMountOptions {
  /** Dedicated, initially empty page element owned by this mount. */
  readonly target: HTMLElement;
  readonly client: WorkspaceClient;
  /** Idempotently reflects an accepted session in the host's location. */
  readonly synchronizeSessionLocation?: (sessionId: string) => void;
  /** Routes host-owned native UI selections through the renderer action registry. */
  readonly actionInvocationSource?: ActionInvocationSource;
}

/** Mount the workspace and return its idempotent page-lifetime capability. */
export function mountWorkspaceClient({
  target,
  client,
  synchronizeSessionLocation,
  actionInvocationSource,
}: WorkspaceClientMountOptions): Disposable {
  installSurfaceSharedModules();
  const root = createRoot(target);
  root.render(
    createElement(
      StrictMode,
      null,
      createElement(WorkspaceClientProvider, {
        client,
        children: createElement(Workspace, {
          synchronizeSessionLocation,
          actionInvocationSource,
        }),
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
