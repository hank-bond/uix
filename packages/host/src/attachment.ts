// The connection's owned, retargetable attachment handle and its implementation.
//
// The connection dispatches canonical requests, retargets sessions, and
// receives only the events the workspace router matches to it.

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

/**
 * The host-facing attachment: one connection's owned, retargetable binding.
 * It dispatches canonical requests, retargets sessions, and receives only the
 * events the workspace router matches to it.
 */
export class Attachment {
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
    return this.#inner.dispatch(request);
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
