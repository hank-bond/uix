// Explicitly scoped canonical runtime events for host-selected delivery.

import type { ChannelCanonicalId } from "@uix/api/channel-resolution";
import type { ChannelEventLogOptions } from "@uix/api/channels";

import type { SessionId } from "./workspace";

export type EventScope =
  | { readonly kind: "workspace" }
  | { readonly kind: "session"; readonly sessionId: SessionId };

export interface RuntimeEvent {
  /** Stable event id, unique within the emitting runtime. */
  readonly id: string;
  /** Canonical channel address used by the receiving client transport. */
  readonly channel: ChannelCanonicalId;
  readonly scope: EventScope;
  readonly payload: unknown;
  readonly logOptions?: ChannelEventLogOptions<unknown>;
}
