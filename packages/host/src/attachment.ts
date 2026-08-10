// the connection's owned, retargetable attachment handle and its local
// implementation. The connection dispatches canonical requests, retargets
// sessions, and receives only the events the workspace router matches to it.

import type {
  AgentInstanceId,
  AttachmentId,
  CanonicalRequest,
  CanonicalResponse,
  RuntimeAttachment,
  RuntimeEvent,
  SessionId,
  SessionTarget,
  WorkspaceId,
} from "@uix/runtime";
import type { AttachmentContext } from "@uix/runtime";

export interface Attachment {
  readonly attachmentId: AttachmentId;
  readonly workspaceId: WorkspaceId;
  readonly sessionId: SessionId;
  readonly instanceId: AgentInstanceId;
  dispatch(request: CanonicalRequest): Promise<CanonicalResponse>;
  retarget(target: SessionTarget): Promise<void>;
  onEvent(listener: (event: RuntimeEvent) => void): Disposable;
  dispose(): Promise<void>;
}

export class LocalAttachment implements Attachment {
  readonly #inner: RuntimeAttachment;
  readonly #listeners = new Set<(event: RuntimeEvent) => void>();
  #disposed = false;

  constructor(inner: RuntimeAttachment) {
    this.#inner = inner;
  }

  get attachmentId(): AttachmentId {
    return this.#inner.attachmentId;
  }

  get workspaceId(): WorkspaceId {
    return this.#inner.workspaceId;
  }

  get sessionId(): SessionId {
    return this.#inner.sessionId;
  }

  get instanceId(): AgentInstanceId {
    return this.#inner.instanceId;
  }

  async dispatch(request: CanonicalRequest): Promise<CanonicalResponse> {
    if (this.#disposed) throw new Error("Attachment is disposed");
    const context: AttachmentContext = {
      workspaceId: this.workspaceId,
      attachmentId: this.attachmentId,
      sessionId: this.sessionId,
    };
    return this.#inner.dispatch(context, request);
  }

  async retarget(target: SessionTarget): Promise<void> {
    if (this.#disposed) throw new Error("Attachment is disposed");
    await this.#inner.retarget(target);
  }

  onEvent(listener: (event: RuntimeEvent) => void): Disposable {
    this.#listeners.add(listener);
    return {
      [Symbol.dispose]: () => {
        this.#listeners.delete(listener);
      },
    };
  }

  /** Router-only delivery: not part of the host-facing Attachment interface. */
  deliver(event: RuntimeEvent): void {
    for (const listener of this.#listeners) listener(event);
  }

  async dispose(): Promise<void> {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#listeners.clear();
    await this.#inner.dispose();
  }
}
