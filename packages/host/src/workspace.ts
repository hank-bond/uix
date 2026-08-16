// Host-level workspace operations and supervisor-only lifecycle authority.

import type {
  Attachment,
  CreatedAttachment,
  EventScope,
  RuntimeEvent,
  SessionTarget,
  WorkspaceId,
  WorkspaceRuntime,
} from "@uix/runtime";

/** Operational surface for one supervised workspace. */
export interface Workspace {
  readonly workspaceId: WorkspaceId;
  createAttachment(target: SessionTarget): Promise<Attachment>;
}

interface DeliveryRecord {
  readonly attachment: Attachment;
  readonly deliver: CreatedAttachment["deliver"];
  readonly closeSubscription: Disposable;
}

/** Supervisor-only capability adding asynchronous lifecycle authority. */
export type WorkspaceOwnership = Workspace & AsyncDisposable;

export function createWorkspaceOwnership(
  runtime: WorkspaceRuntime,
): WorkspaceOwnership {
  return new WorkspaceOwnershipState(runtime);
}

class WorkspaceOwnershipState implements WorkspaceOwnership {
  readonly #runtime: WorkspaceRuntime;
  readonly #attachments = new Map<string, DeliveryRecord>();
  #runtimeSubscription: Disposable | undefined;
  #disposal: Promise<void> | undefined;

  constructor(runtime: WorkspaceRuntime) {
    this.#runtime = runtime;
    this.#runtimeSubscription = runtime.onEvent((event) => {
      this.#route(event);
    });
  }

  get workspaceId(): WorkspaceId {
    return this.#runtime.workspaceId;
  }

  async createAttachment(target: SessionTarget): Promise<Attachment> {
    const created = await this.#runtime.createAttachment(target);
    const { attachment } = created;
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

  [Symbol.asyncDispose](): Promise<void> {
    if (this.#disposal) return this.#disposal;
    this.#disposal = (async () => {
      this.#runtimeSubscription?.[Symbol.dispose]();
      this.#runtimeSubscription = undefined;
      const records = [...this.#attachments.values()];
      this.#attachments.clear();
      for (const record of records) {
        record.closeSubscription[Symbol.dispose]();
        record.attachment[Symbol.dispose]();
      }
      await this.#runtime[Symbol.asyncDispose]();
    })();
    return this.#disposal;
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
