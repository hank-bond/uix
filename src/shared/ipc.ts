// Shared IPC contract for the Electron host shell.
//
// Host-level invoke channels and the preload transport surface. The substrate
// channel contract (the `uix` feature channels), surface entries, and reload
// results live in `@uix/api/substrate-channels`: they are produced by the
// workspace runtime and consumed by the renderer through the same channel
// path as feature contracts. Renderer never imports `electron`. It only sees
// the surface exposed by the preload via contextBridge. These types describe
// that contract so both sides stay in sync.

import type { ReloadResult } from "@uix/api/substrate-channels";

/** Host channel names. Keep this list small. Features register their own. */
export const Channels = {
  /** Renderer → main. Generic canonical workspace request. */
  request: "uix:request",
  /** Renderer → main. invoke-style. Reloads host resources in place. */
  reload: "uix:reload",
  /** Launcher → main. invoke-style. Reads the known workspace catalog. */
  launcherState: "uix:launcher:state",
  /** Launcher → main. invoke-style. Open an existing workspace by manifest path. */
  launcherOpen: "uix:launcher:open",
  /** Launcher → main. invoke-style. Create (or adopt) a workspace via dir dialog. */
  launcherCreate: "uix:launcher:create",
} as const;

/** A previously opened workspace listed by the launcher. */
export interface RecentWorkspace {
  /** Absolute path to the workspace's uix.workspace.json. The identity. */
  manifestPath: string;
  /** The manifest's `name` at open time. */
  name: string;
  /** ISO timestamp of the last open, newest first in the recents list. */
  openedAt: string;
}

export interface LauncherState {
  recents: RecentWorkspace[];
}

export interface LauncherOpenRequest {
  manifestPath: string;
}

export interface LauncherCreateRequest {
  /** Workspace name written into the new manifest. Falls back to the dir name. */
  name: string;
}

/**
 * Result of a launcher action. `ok: true` means the host is transitioning to the
 * workspace (the launcher window is about to close); `canceled` means the user
 * dismissed the native dialog and the launcher stays up.
 */
export type LauncherActionResult =
  | { ok: true }
  | { ok: false; canceled?: boolean; error?: string };

/** Shape exposed on `window.channels` by the preload. */
export interface ChannelTransport {
  /** Generic request/response over IPC. Channel name is the transport address. */
  request(channel: string, payload: unknown): Promise<unknown>;
  /** Generic event subscription over IPC. Returns an unsubscribe function. */
  subscribe(channel: string, handler: (payload: unknown) => void): () => void;
  /** Programmatic hook for future command palette/menu/chat /reload. */
  reload: () => Promise<ReloadResult>;
}
