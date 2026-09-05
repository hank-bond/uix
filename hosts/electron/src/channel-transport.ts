// Defines the Electron host channel transport shared by main, preload, and renderer code.
//
// Host-level invoke channels and the preload transport surface. The substrate
// channel contract (including Workspace reload) lives in
// `@uix/api/substrate-channels` and crosses the generic canonical request path.
// Renderer never imports `electron`. It only sees the surface exposed by the
// preload via contextBridge. These types describe that contract so both sides
// stay in sync.

import { type Static, Type } from "typebox";
import { Value } from "typebox/value";

/** Host channel names. Keep this list small. Features register their own. */
export const Channels = {
  /** Renderer → main. Generic canonical workspace request. */
  request: "uix:request",
  /** Host-only attachment bootstrap and ordered target replacement notifications. */
  webBindingRead: "uix:web-binding:read",
  webBindingChanged: "uix:web-binding:changed",
  /** Electron menu → focused renderer. Requests one action by canonical id. */
  actionInvocation: "uix:action:invoke",
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

const AttachmentWebBindingSnapshotSchema = Type.Object(
  {
    revision: Type.Integer({ minimum: 0, maximum: Number.MAX_SAFE_INTEGER }),
    workspaceId: Type.String({ pattern: "^[a-z][a-z0-9-]*$" }),
    binding: Type.String({ minLength: 1 }),
  },
  { additionalProperties: false },
);

/** One immutable revision of a window's attachment target, never feature state. */
export type AttachmentWebBindingSnapshot = Readonly<
  Static<typeof AttachmentWebBindingSnapshotSchema>
>;

/** Validate host control data before it enters attachment-root ordering or URL encoding. */
export function parseAttachmentWebBindingSnapshot(
  value: unknown,
): AttachmentWebBindingSnapshot {
  Value.Assert(AttachmentWebBindingSnapshotSchema, value);
  return Object.freeze({ ...value });
}

/** Host-only bridge exposed separately from canonical feature traffic. */
export interface AttachmentWebBindingTransport {
  read(): Promise<AttachmentWebBindingSnapshot>;
  subscribe(
    listener: (snapshot: AttachmentWebBindingSnapshot) => void,
  ): () => void;
}

/** Shape exposed on `window.channels` by the preload. */
export interface ChannelTransport {
  /** Generic request/response over IPC. Channel name is the transport address. */
  request(channel: string, payload: unknown): Promise<unknown>;
  /** Generic event subscription over IPC. Returns an unsubscribe function. */
  subscribe(channel: string, handler: (payload: unknown) => void): () => void;
}
