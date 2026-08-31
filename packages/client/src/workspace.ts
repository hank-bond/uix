// Mounts the shared workspace page over host-constructed client capabilities.

import "./workspace/workspace.css";

import { createElement, StrictMode } from "react";
import { createRoot } from "react-dom/client";

import {
  type WorkspaceClient,
  WorkspaceClientProvider,
} from "@uix/api/workspace";

import type { ActionInvocationSource } from "./workspace/action-invocation-source";
import type { SessionLocationAdapter } from "./workspace/session-location";
import { installSurfaceSharedModules } from "./workspace/surface-shared-modules";
import { Workspace } from "./workspace/Workspace";

export type { ActionInvocationSource } from "./workspace/action-invocation-source";
export type { SessionLocationAdapter } from "./workspace/session-location";

export interface WorkspaceClientMountOptions {
  /** Dedicated, initially empty page element owned by this mount. */
  readonly target: HTMLElement;
  readonly client: WorkspaceClient;
  /** Optional bidirectional bridge to host-owned session locations. */
  readonly sessionLocationAdapter?: SessionLocationAdapter;
  /** Routes host-owned native UI selections through the renderer action registry. */
  readonly actionInvocationSource?: ActionInvocationSource;
}

/** Mount the workspace and return its idempotent page-lifetime capability. */
export function mountWorkspaceClient({
  target,
  client,
  sessionLocationAdapter,
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
          sessionLocationAdapter,
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
