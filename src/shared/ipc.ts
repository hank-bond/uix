// shared IPC contract.
//
// Substrate-owned channels are scoped under `uix:` so they don't collide with
// feature channels or other transport messages. Renderer never imports
// `electron`; it only sees the surface exposed by the preload via
// contextBridge. These types describe that contract so both sides stay
// in sync.

import { Type, type Static } from "typebox";
import { KeybindingMapSchema } from "@uix/api/actions";
import type { ChannelContract } from "@uix/api/channels";
import {
  FeatureSettingAddressSchema,
  FeatureSettingValueEnvelopeSchema,
} from "@uix/api/settings";

/** Substrate channel names. Keep this list small — features register their own. */
export const Channels = {
  /** Renderer → main. invoke-style. Reloads cockpit resources in place. */
  reload: "uix:reload",
  /** Picker → main. invoke-style. Recents for the start picker. */
  pickerState: "uix:picker:state",
  /** Picker → main. invoke-style. Open an existing workspace by manifest path. */
  pickerOpen: "uix:picker:open",
  /** Picker → main. invoke-style. Create (or adopt) a workspace via dir dialog. */
  pickerCreate: "uix:picker:create",
} as const;

/** A previously opened workspace, listed by the start picker. */
export interface RecentWorkspace {
  /** Absolute path to the workspace's uix.workspace.json. The identity. */
  manifestPath: string;
  /** The manifest's `name` at the time it was opened. */
  name: string;
  /** ISO timestamp of the last open, newest first in the recents list. */
  openedAt: string;
}

export interface PickerState {
  recents: RecentWorkspace[];
}

export interface PickerOpenRequest {
  manifestPath: string;
}

export interface PickerCreateRequest {
  /** Workspace name written into the new manifest; falls back to the dir name. */
  name: string;
}

/**
 * Result of a picker action. `ok: true` means the App is transitioning to the
 * workspace (the picker window is about to close); `canceled` means the user
 * dismissed the native dialog and the picker stays up.
 */
export type PickerActionResult =
  | { ok: true }
  | { ok: false; canceled?: boolean; error?: string };

/** One feature that failed to activate during a load pass. */
export interface ReloadFailure {
  /** The manifest ref as written — the human/agent-facing label. */
  feature: string;
  /** Absolute entry-file path. */
  entry: string;
  /** The activation error message (e.g. names a missing module to install). */
  error: string;
}

export interface ReloadResult {
  featuresLoaded: number;
  featuresFailed: number;
  /** Per-feature failure detail, so the caller can act rather than count. */
  failures: ReloadFailure[];
  /** True when a pi session already existed and pi's reload path ran. */
  piReloaded: boolean;
}

/**
 * A surface entry the workspace page can mount: which feature contributed
 * it, the absolute entry-file path the contribution resolved to (for error
 * attribution), and either the content-hash-busted module URL to
 * dynamic-import or the build error to render as an error card.
 */
export const SurfaceEntrySchema = Type.Object({
  featureId: Type.String(),
  entry: Type.String(),
  url: Type.Optional(Type.String()),
  error: Type.Optional(Type.String()),
});
export type SurfaceEntry = Static<typeof SurfaceEntrySchema>;

// Substrate workspace channels under the reserved `uix` id — the surface
// composition the renderer mounts. Same contract discipline as agentChannels.
export const uixChannels = {
  feature: "uix",
  requests: {
    surfaces: {
      requestSchema: Type.Void(),
      responseSchema: Type.Object({
        surfaces: Type.Array(SurfaceEntrySchema),
        /** Where the manifest is (or would be) — existence checked per request,
         * so a manifest created after boot flips this on the next fetch. */
        manifestPath: Type.String(),
        manifestFound: Type.Boolean(),
      }),
    },
    get_setting: {
      requestSchema: FeatureSettingAddressSchema,
      responseSchema: Type.Unknown(),
    },
    set_setting: {
      requestSchema: FeatureSettingValueEnvelopeSchema,
      responseSchema: Type.Void(),
    },
    reconcile_keybindings: {
      requestSchema: KeybindingMapSchema,
      responseSchema: KeybindingMapSchema,
    },
    replace_keybindings: {
      requestSchema: KeybindingMapSchema,
      responseSchema: KeybindingMapSchema,
    },
  },
  events: {
    surfaces_changed: {
      event: Type.Object({}),
    },
    setting_changed: {
      event: FeatureSettingValueEnvelopeSchema,
    },
    keybindings_changed: {
      event: KeybindingMapSchema,
    },
  },
} as const satisfies ChannelContract;

/** Shape exposed on `window.uix` by the preload. */
export interface ChannelTransport {
  /** Generic request/response over IPC. Channel name is the transport address. */
  request(name: string, payload: unknown): Promise<unknown>;
  /** Generic event subscription over IPC. Returns an unsubscribe function. */
  subscribe(name: string, handler: (payload: unknown) => void): () => void;
  /** Programmatic hook for future command palette/menu/chat /reload. */
  reload: () => Promise<ReloadResult>;
}
