// The substrate's own channel contract and surface-composition types.
//
// The substrate scopes its channels under the reserved `uix` id so they do not
// collide with feature channels. The runtime registers these handlers, the
// renderer consumes the contract through the same channel-client path as
// feature contracts, and the surface composition it serves is the workspace
// page's mount list. Workspace reload crosses this same canonical substrate
// channel so browser and native hosts share one runtime operation.

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
export const ReloadFailureSchema = Type.Object({
  /** The manifest ref as written: the human/agent-facing label. */
  feature: Type.String(),
  /** Absolute entry-file path. */
  entry: Type.String(),
  /** The activation error message (e.g. names a missing module to install). */
  error: Type.String(),
});
export type ReloadFailure = Static<typeof ReloadFailureSchema>;

/** The runtime's validated reload outcome. */
export const ReloadResultSchema = Type.Object({
  featuresActivated: Type.Integer({ minimum: 0 }),
  featuresFailed: Type.Integer({ minimum: 0 }),
  /** Per-feature failure detail, so the caller can act rather than count. */
  failures: Type.Array(ReloadFailureSchema),
  /** True when an initialized Pi runtime existed and its reload path ran. */
  piResourcesReloaded: Type.Boolean(),
});
export type ReloadResult = Static<typeof ReloadResultSchema>;

// Substrate page channels under the reserved `uix` id: the surface
// composition the renderer mounts. Same contract discipline as agentChannels.
export const substrateChannels = {
  requests: {
    reload: {
      requestSchema: Type.Void(),
      responseSchema: ReloadResultSchema,
    },
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
