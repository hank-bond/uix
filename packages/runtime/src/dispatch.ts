// canonical channel request/response envelope and host-stamped attachment
// context. Hosts route, runtimes dispatch. The envelope carries no transport
// or tenancy fields, and the wire protocol in H8 adds correlation at the
// transport boundary without changing this contract.

import type { ChannelCanonicalId } from "@uix/api/channel-resolution";

import type { AttachmentId, SessionId, WorkspaceId } from "./workspace";

/** One canonical channel request. The canonical id is the transport address. */
export interface CanonicalRequest {
  readonly channel: ChannelCanonicalId;
  readonly payload: unknown;
}

export interface RequestError {
  readonly code: string;
  readonly message: string;
}

/** Canonical dispatch result: a value or an explicit, structured error. */
export type CanonicalResponse =
  | { readonly ok: true; readonly value: unknown }
  | { readonly ok: false; readonly error: RequestError };

/** Host-stamped attachment context, delivered outside feature payloads. */
export interface AttachmentContext {
  readonly workspaceId: WorkspaceId;
  readonly attachmentId: AttachmentId;
  readonly sessionId: SessionId;
}
