// the workspace-runtime contract: ids, session targets, and the
// exactly-one-workspace runtime surface the host supervisor composes.
//
// H2 defines the smallest executable shape against fake runtimes. H3
// implements it for real and ports the substrate out of src/main. A host
// never assumes one workspace per process or one globally selected session;
// session choice lives on each attachment.

import type {
  AttachmentContext,
  CanonicalRequest,
  CanonicalResponse,
} from "./dispatch";
import type { RuntimeEvent } from "./events";

const WorkspaceIdBrand: unique symbol = Symbol("WorkspaceId");
const SessionIdBrand: unique symbol = Symbol("SessionId");
const AgentInstanceIdBrand: unique symbol = Symbol("AgentInstanceId");
const AttachmentIdBrand: unique symbol = Symbol("AttachmentId");

/** Canonical workspace id, owned by the host's workspace catalog. */
export type WorkspaceId = string & { readonly [WorkspaceIdBrand]: true };

/** Durable session id within one workspace's session tree. */
export type SessionId = string & { readonly [SessionIdBrand]: true };

/** One live agent execution at a session-branch viewpoint. */
export type AgentInstanceId = string & {
  readonly [AgentInstanceIdBrand]: true;
};

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

export function toAgentInstanceId(id: string): AgentInstanceId {
  assertIdToken("agent instance id", id);
  return id as AgentInstanceId;
}

export function toAttachmentId(id: string): AttachmentId {
  assertIdToken("attachment id", id);
  return id as AttachmentId;
}

/** Initial resolution target: one durable session, resolved to its primary agent instance by the runtime. */
export interface SessionTarget {
  readonly sessionId: SessionId;
}

/**
 * The exactly-one-workspace runtime surface a host composes. The runtime
 * owns dispatch and agent-instance resolution. The host owns the connection
 * and routes events. A host never assumes this runtime lives in its process.
 */
export interface WorkspaceRuntime {
  readonly workspaceId: WorkspaceId;
  /** Subscribe to runtime-owned scoped events. The host routes them to matching attachments. */
  onEvent(listener: (event: RuntimeEvent) => void): Disposable;
  /** Create an attachment bound to a session target, booting its primary agent instance single-flight. */
  createAttachment(target: SessionTarget): Promise<RuntimeAttachment>;
  /** Dispose the runtime: tear down agent instances and release routes. Idempotent. */
  dispose(): Promise<void>;
}

/** The runtime-owned half of an attachment: the binding that resolves the session and agent instance. */
export interface RuntimeAttachment {
  readonly attachmentId: AttachmentId;
  readonly workspaceId: WorkspaceId;
  /** Current session target. */
  readonly sessionId: SessionId;
  /** The primary agent instance currently bound. */
  readonly instanceId: AgentInstanceId;
  /** Dispatch one canonical channel request. The host stamps attachment context outside the payload. */
  dispatch(
    context: AttachmentContext,
    request: CanonicalRequest,
  ): Promise<CanonicalResponse>;
  /** Retarget to another session: acquire the new instance before releasing the old one. A failure leaves the target unchanged. */
  retarget(target: SessionTarget): Promise<void>;
  /** Release this attachment's retention on its instance. Idempotent. */
  dispose(): Promise<void>;
}
