// The host-facing WorkspaceHandle: wraps one in-process runtime and routes scoped events to matching attachments.
//
// Nothing here assumes one workspace per process or a globally selected
// session. Session choice lives on each attachment.

import type {
  RuntimeEvent,
  SessionTarget,
  WorkspaceId,
  WorkspaceRuntime,
} from "@uix/runtime";
import type { EventScope } from "@uix/runtime";

import { Attachment } from "./attachment";

/**
 * The host-facing workspace handle: wraps one in-process runtime and routes
 * scoped events to matching attachments. A supervisor holds several handles
 * in one process.
 */
export class WorkspaceHandle {
  readonly #runtime: WorkspaceRuntime;
  readonly #attachments = new Set<Attachment>();
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
    const attachment = new Attachment(inner);
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
  }
}
