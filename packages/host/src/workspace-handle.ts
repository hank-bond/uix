// the host-facing WorkspaceHandle shape plus the local handle that routes
// scoped runtime events to matching attachments. A future proxy handle
// implements the same interface. Nothing here assumes one workspace per
// process or a globally selected session.

import type {
  RuntimeEvent,
  SessionTarget,
  WorkspaceId,
  WorkspaceRuntime,
} from "@uix/runtime";
import type { EventScope } from "@uix/runtime";

import type { Attachment } from "./attachment";
import { LocalAttachment } from "./attachment";

export interface WorkspaceHandle {
  readonly workspaceId: WorkspaceId;
  createAttachment(target: SessionTarget): Promise<Attachment>;
  dispose(): Promise<void>;
}

export class LocalWorkspaceHandle implements WorkspaceHandle {
  readonly #runtime: WorkspaceRuntime;
  readonly #attachments = new Set<LocalAttachment>();
  #subscription: Disposable | undefined;
  #disposed = false;

  constructor(runtime: WorkspaceRuntime) {
    this.#runtime = runtime;
    this.#subscription = runtime.onEvent((event) => {
      this.#route(event);
    });
  }

  get workspaceId(): WorkspaceId {
    return this.#runtime.workspaceId;
  }

  async createAttachment(target: SessionTarget): Promise<Attachment> {
    if (this.#disposed) throw new Error("Workspace handle is disposed");
    const inner = await this.#runtime.createAttachment(target);
    const attachment = new LocalAttachment(inner);
    this.#attachments.add(attachment);
    return attachment;
  }

  #route(event: RuntimeEvent): void {
    for (const attachment of this.#attachments) {
      if (matchesScope(event.scope, attachment)) attachment.deliver(event);
    }
  }

  async dispose(): Promise<void> {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#subscription?.[Symbol.dispose]();
    this.#subscription = undefined;
    for (const attachment of [...this.#attachments]) {
      await attachment.dispose();
    }
    this.#attachments.clear();
    await this.#runtime.dispose();
  }
}

function matchesScope(scope: EventScope, attachment: Attachment): boolean {
  switch (scope.kind) {
    case "workspace":
      return true;
    case "session":
      return scope.sessionId === attachment.sessionId;
    case "agent-instance":
      return scope.instanceId === attachment.instanceId;
  }
}
