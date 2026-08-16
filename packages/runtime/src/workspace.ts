// The workspace-runtime contract: ids, session targets, and the exactly-one-workspace runtime surface a host composes.
//
// A host never assumes one workspace per process or one globally selected
// session. Session choice lives on each attachment.

import type { ReloadResult } from "@uix/api/substrate-channels";

import type { CanonicalRequest, PreparedDispatch } from "./dispatch";
import type { RuntimeEvent } from "./events";
import type { ActivationResult } from "./features/loader";

const WorkspaceIdBrand: unique symbol = Symbol("WorkspaceId");
const SessionIdBrand: unique symbol = Symbol("SessionId");
const BranchIdBrand: unique symbol = Symbol("BranchId");
const AttachmentIdBrand: unique symbol = Symbol("AttachmentId");

/** Canonical workspace id, owned by the host's workspace catalog. */
export type WorkspaceId = string & { readonly [WorkspaceIdBrand]: true };

/** Durable session id within one workspace's session tree. */
export type SessionId = string & { readonly [SessionIdBrand]: true };

/** Durable id of the first Pi entry belonging to one branch. */
export type BranchId = string & { readonly [BranchIdBrand]: true };

/** A connection's owned, retargetable binding within one workspace. */
export type AttachmentId = string & { readonly [AttachmentIdBrand]: true };

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

/** One durable session and optional born-branch viewpoint to resolve. */
export interface SessionTarget {
  readonly sessionId: SessionId;
  /** Id of the branch's first entry. Undefined while the branch is unborn. */
  readonly branchId?: BranchId;
}

/**
 * The exactly-one-workspace runtime surface a host composes. The runtime
 * owns dispatch and agent resolution. The host owns the connection
 * and routes events. A host never assumes this runtime lives in its process.
 */
export interface WorkspaceRuntime {
  readonly workspaceId: WorkspaceId;
  /** Subscribe to runtime-owned scoped events. The host routes them to matching attachments. */
  onEvent(listener: (event: RuntimeEvent) => void): Disposable;
  /** Create one attachment and its supervisor-private event delivery closure. */
  createAttachment(target?: SessionTarget): Promise<CreatedAttachment>;
  /** Activate the initial feature composition. A bad manifest logs and boots with no features. */
  load(): Promise<ActivationResult>;
  /** Replace the active feature composition and Pi resource tier, then notify the renderer. */
  reload(): Promise<ReloadResult>;
  /** Dispose the runtime: tear down agent instances and release routes. Idempotent. */
  dispose(): Promise<void>;
  /** Sync bag shim for host composition: fires the async dispose without awaiting it. */
  [Symbol.dispose](): void;
}

/** One connection's runtime-created request, target, event, and lifetime capability. */
export interface Attachment extends Disposable {
  readonly attachmentId: AttachmentId;
  readonly workspaceId: WorkspaceId;
  /** Current accepted durable target. */
  readonly target: SessionTarget;
  /** Accept one request with immutable guarded context. */
  prepareDispatch(request: CanonicalRequest): PreparedDispatch;
  /** Acquire the new target before synchronously releasing the previous guard. */
  retarget(target: SessionTarget): Promise<void>;
  /** Observe events selected and delivered by the supervised workspace. */
  onEvent(listener: (event: RuntimeEvent) => void): Disposable;
  /** Observe deterministic attachment closure. */
  onClose(listener: () => void): Disposable;
  /** Close event observation and dispose the target guard. Idempotent. */
  dispose(): void;
}

/** Runtime creation result. Only the supervised workspace keeps `deliver`. */
export interface CreatedAttachment {
  readonly attachment: Attachment;
  deliver(event: RuntimeEvent): void;
}
