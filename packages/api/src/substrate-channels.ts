// The substrate's own channel contract and surface-composition types.
//
// The substrate scopes its channels under the reserved `uix` id so they do not
// collide with feature channels. The runtime registers these handlers, the
// renderer consumes the contract through the same channel-client path as
// feature contracts, and the surface composition it serves is the workspace
// page's mount list. Reload results cross the host reload channel but are
// produced by the runtime, so their shape lives here beside the surfaces
// contract.

import { type Static, Type } from "typebox";

import { KeybindingMapSchema } from "./actions";
import type { ChannelContract } from "./channels";
import {
  FeatureSettingAddressSchema,
  FeatureSettingValueEnvelopeSchema,
} from "./settings";

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

/** One feature that failed to activate during a load pass. */
export interface ReloadFailure {
  /** The manifest ref as written: the human/agent-facing label. */
  feature: string;
  /** Absolute entry-file path. */
  entry: string;
  /** The activation error message (e.g. names a missing module to install). */
  error: string;
}

/** The runtime's reload outcome, delivered over the host's reload channel. */
export interface ReloadResult {
  featuresActivated: number;
  featuresFailed: number;
  /** Per-feature failure detail, so the caller can act rather than count. */
  failures: ReloadFailure[];
  /** True when a Pi session already existed and Pi's reload path ran. */
  piResourcesReloaded: boolean;
}

// Substrate page channels under the reserved `uix` id: the surface
// composition the renderer mounts. Same contract discipline as agentChannels.
export const substrateChannels = {
  feature: "uix",
  requests: {
    surfaces: {
      requestSchema: Type.Void(),
      responseSchema: Type.Object({
        surfaces: Type.Array(SurfaceEntrySchema),
        /** Where the manifest is (or would be): existence checked per request,
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
