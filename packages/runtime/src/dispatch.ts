// Canonical request preparation and the attachment-stamped dispatch context.

import type { SessionManager } from "@earendil-works/pi-coding-agent";

import type { ChannelCanonicalId } from "@uix/api/channel-resolution";
import type { ChannelRequestLogOptions } from "@uix/api/channels";

import type { AgentInstanceGuard } from "./agent/instance-supervisor";
import type { AttachmentId, SessionTarget, WorkspaceId } from "./workspace";

/** One canonical channel request. Transport correlation stays host-owned. */
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

/** Immutable attachment-stamped context accepted for one dispatch. */
export interface AttachmentDispatchContext {
  readonly workspaceId: WorkspaceId;
  readonly attachmentId: AttachmentId;
  readonly target: SessionTarget;
  readonly agentInstanceGuard: AgentInstanceGuard;
  /** Retarget the authorizing attachment and guard the accepted new target. */
  retarget(
    target: SessionTarget,
    openedManager?: SessionManager,
  ): Promise<AgentInstanceGuard>;
}

/** One accepted request with resolved channel policy and an operation guard. */
export interface PreparedDispatch extends Disposable {
  readonly request: CanonicalRequest;
  readonly logOptions: ChannelRequestLogOptions<unknown, unknown>;
  /** Invoke the resolved handler once and release the operation guard. */
  invoke(): Promise<CanonicalResponse>;
}
