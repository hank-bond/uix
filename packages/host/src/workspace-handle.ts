// Private supervised-workspace ownership and its narrow public handle.

import type {
  Attachment,
  CreatedAttachment,
  EventScope,
  RuntimeEvent,
  SessionTarget,
  WorkspaceId,
  WorkspaceRuntime,
} from "@uix/runtime";

interface WorkspaceHandleOwner {
  readonly workspaceId: WorkspaceId;
  createAttachment(target: SessionTarget): Promise<Attachment>;
}

/** Narrow host-facing capability for one supervised workspace. */
export class WorkspaceHandle {
  readonly #owner: WorkspaceHandleOwner;

  constructor(owner: WorkspaceHandleOwner) {
    this.#owner = owner;
  }

  get workspaceId(): WorkspaceId {
    return this.#owner.workspaceId;
  }

  createAttachment(target: SessionTarget): Promise<Attachment> {
    return this.#owner.createAttachment(target);
  }
}

interface DeliveryRecord {
  readonly attachment: Attachment;
  readonly deliver: CreatedAttachment["deliver"];
  readonly closeSubscription: Disposable;
}

/** Supervisor-private parent lifetime for one workspace runtime and its attachments. */
export class SupervisedWorkspace implements WorkspaceHandleOwner {
  readonly #runtime: WorkspaceRuntime;
  readonly #handle: WorkspaceHandle;
  readonly #attachments = new Map<string, DeliveryRecord>();
  #runtimeSubscription: Disposable | undefined;
  #disposal: Promise<void> | undefined;
  #disposed = false;

  constructor(runtime: WorkspaceRuntime) {
    this.#runtime = runtime;
    this.#handle = new WorkspaceHandle(this);
    this.#runtimeSubscription = runtime.onEvent((event) => {
      this.#route(event);
    });
  }

  get workspaceId(): WorkspaceId {
    return this.#runtime.workspaceId;
  }

  get handle(): WorkspaceHandle {
    return this.#handle;
  }

  async createAttachment(target: SessionTarget): Promise<Attachment> {
    if (this.#disposed) throw new Error("Workspace is disposed");
    const created = await this.#runtime.createAttachment(target);
    const { attachment } = created;
    if (this.#isDisposed()) {
      attachment.dispose();
      throw new Error("Workspace is disposed");
    }
    const closeSubscription = attachment.onClose(() => {
      const record = this.#attachments.get(attachment.attachmentId);
      if (record?.attachment !== attachment) return;
      this.#attachments.delete(attachment.attachmentId);
      record.closeSubscription[Symbol.dispose]();
    });
    this.#attachments.set(attachment.attachmentId, {
      attachment,
      deliver: (event) => {
        created.deliver(event);
      },
      closeSubscription,
    });
    return attachment;
  }

  dispose(): Promise<void> {
    if (this.#disposal) return this.#disposal;
    this.#disposed = true;
    this.#disposal = (async () => {
      this.#runtimeSubscription?.[Symbol.dispose]();
      this.#runtimeSubscription = undefined;
      const records = [...this.#attachments.values()];
      this.#attachments.clear();
      for (const record of records) {
        record.closeSubscription[Symbol.dispose]();
        record.attachment.dispose();
      }
      await this.#runtime.dispose();
    })();
    return this.#disposal;
  }

  #isDisposed(): boolean {
    return this.#disposed;
  }

  #route(event: RuntimeEvent): void {
    for (const { attachment, deliver } of this.#attachments.values()) {
      if (matchesScope(event.scope, attachment)) deliver(event);
    }
  }
}

function matchesScope(scope: EventScope, attachment: Attachment): boolean {
  switch (scope.kind) {
    case "workspace":
      return true;
    case "session":
      return scope.sessionId === attachment.target.sessionId;
  }
}
