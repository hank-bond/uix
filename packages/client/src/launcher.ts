// Mounts the shared launcher page over host-provided catalog capabilities.

import "./launcher/launcher.css";

import { createElement, StrictMode } from "react";
import { createRoot } from "react-dom/client";

import type { LauncherAdapter } from "./launcher/adapter";
import { Launcher } from "./launcher/Launcher";

export type {
  LauncherActionOutcome,
  LauncherAdapter,
  LauncherWorkspace,
} from "./launcher/adapter";

export interface LauncherClientMountOptions {
  /** Dedicated, initially empty page element owned by this mount. */
  readonly target: HTMLElement;
  readonly adapter: LauncherAdapter;
}

/** Mount the launcher and return its idempotent page-lifetime capability. */
export function mountLauncherClient({
  target,
  adapter,
}: LauncherClientMountOptions): Disposable {
  const root = createRoot(target);
  root.render(
    createElement(StrictMode, null, createElement(Launcher, { adapter })),
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
