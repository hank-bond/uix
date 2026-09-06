// The host-facing contract for one workspace runtime and its attachments.
//
// A host never assumes one workspace per process or one globally selected
// session. Session choice lives on each attachment.

import type { WebRouteResponse } from "@uix/api/web-routes";

import type { CanonicalRequest, PreparedDispatch } from "./dispatch";
import type { RuntimeEvent } from "./events";
import type { ActivationResult } from "./features/loader";

const WorkspaceIdBrand: unique symbol = Symbol("WorkspaceId");
const SessionIdBrand: unique symbol = Symbol("SessionId");
const BranchIdBrand: unique symbol = Symbol("BranchId");
const AttachmentIdBrand: unique symbol = Symbol("AttachmentId");
const AttachmentWebBindingBrand: unique symbol = Symbol("AttachmentWebBinding");

/** Canonical workspace id, owned by the host's workspace catalog. */
export type WorkspaceId = string & { readonly [WorkspaceIdBrand]: true };

/** Durable session id within one workspace's session tree. */
export type SessionId = string & { readonly [SessionIdBrand]: true };

/** Durable id of the first Pi entry belonging to one branch. */
export type BranchId = string & { readonly [BranchIdBrand]: true };

/** A connection's owned, retargetable binding within one workspace. */
export type AttachmentId = string & { readonly [AttachmentIdBrand]: true };

/**
 * Opaque host-facing token for one attachment-target generation.
 * Encode it into a physical address without treating it as an authorization credential.
 */
export type AttachmentWebBinding = string & {
  readonly [AttachmentWebBindingBrand]: true;
};

function assertIdToken(label: string, id: string): void {
  if (id.length === 0 || id.trim() !== id) {
    throw new Error(
      `Invalid ${label}: ${JSON.stringify(id)}. Expected a non-empty token.`,
    );
  }
}

export function toWorkspaceId(id: string): WorkspaceId {
  assertIdToken("workspace id", id);
  return id as WorkspaceId;
}

export function toSessionId(id: string): SessionId {
  assertIdToken("session id", id);
  return id as SessionId;
}

export function toBranchId(id: string): BranchId {
  assertIdToken("branch id", id);
  return id as BranchId;
}

export function toAttachmentId(id: string): AttachmentId {
  assertIdToken("attachment id", id);
  return id as AttachmentId;
}

/** One host-decoded request for an attachment-bound viewpoint route. */
export interface ViewpointWebRequest {
  /** Opaque binding presented exactly as the host decoded it. */
  readonly binding: string;
  /** Feature namespace decoded from the physical feature root. */
  readonly namespace: string;
  readonly method: string;
  /** Feature-relative pathname beginning with `/`. */
  readonly pathname: string;
  /** Encoded query text without the leading `?`. */
  readonly queryString: string;
}

/** Host-neutral response below physical URL and browser response adaptation. */
export type ViewpointWebResponse =
  | WebRouteResponse
  | {
      readonly status: 400 | 404 | 405 | 500;
      readonly content: "text";
      readonly body: string;
    };

/** One durable session and optional born-branch viewpoint to resolve. */
export interface SessionTarget {
  readonly sessionId: SessionId;
  /** Id of the branch's first entry. Undefined while the branch is unborn. */
  readonly branchId?: BranchId;
}

/** Host policy for resolving the initial target of one atomic attachment creation. */
export type AttachmentAdmission =
  | { readonly kind: "fallback" }
  | { readonly kind: "new-session" }
  | { readonly kind: "session"; readonly target: SessionTarget };

/**
 * The exactly-one-workspace runtime surface a host composes. The runtime
 * owns dispatch and agent resolution. The host owns the connection
 * and routes events. A host never assumes this runtime lives in its process.
 */
export interface WorkspaceRuntime extends AsyncDisposable {
  readonly workspaceId: WorkspaceId;
  /** Subscribe to runtime-owned scoped events. The host routes them to matching attachments. */
  onEvent(listener: (event: RuntimeEvent) => void): Disposable;
  /** Atomically resolve the admitted target and create its attachment. */
  createAttachment(admission: AttachmentAdmission): Promise<CreatedAttachment>;
  /** Dispatch through the Agent generation retained from one live web binding. */
  dispatchViewpointWebRequest(
    request: ViewpointWebRequest,
  ): Promise<ViewpointWebResponse>;
  /** Activate the initial feature composition. A bad manifest logs and boots with no features. */
  load(): Promise<ActivationResult>;
}

/** One connection's runtime-created request, target, event, and lifetime capability. */
export interface Attachment extends Disposable {
  readonly attachmentId: AttachmentId;
  readonly workspaceId: WorkspaceId;
  /** Current accepted durable target. */
  readonly target: SessionTarget;
  /** Current private binding for the accepted target generation. */
  readonly webBinding: AttachmentWebBinding;
  /** Accept one request with immutable guarded context. */
  prepareDispatch(request: CanonicalRequest): PreparedDispatch;
  /** Acquire the new target before synchronously releasing the previous guard. */
  retarget(target: SessionTarget): Promise<void>;
  /**
   * Observe replacements of the current target generation's private binding.
   * Listener failures do not reject an accepted retarget.
   */
  onWebBindingChange(
    listener: (binding: AttachmentWebBinding) => void,
  ): Disposable;
  /** Observe events selected and delivered by the supervised workspace. */
  onEvent(listener: (event: RuntimeEvent) => void): Disposable;
  /** Observe deterministic attachment closure. */
  onClose(listener: () => void): Disposable;
  /** Close event observation and dispose the target guard. Idempotent. */
  [Symbol.dispose](): void;
}

/** Runtime creation result. Only the supervised workspace keeps `deliver`. */
export interface CreatedAttachment {
  readonly attachment: Attachment;
  deliver(event: RuntimeEvent): void;
}
