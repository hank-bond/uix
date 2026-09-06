// Owns one connection's Agent target, retained request authority, web binding, event observation, and disposal.

import type { SessionManager } from "@earendil-works/pi-coding-agent";

import type { AgentInstanceGuard } from "./agent/instance-supervisor";
import type { AttachmentWebBindingHandle } from "./attachment-web-bindings";
import type {
  AttachmentDispatchContext,
  CanonicalRequest,
  PreparedDispatch,
} from "./dispatch";
import type { RuntimeEvent } from "./events";
import { disposable } from "./lifecycle";
import { createLogger } from "./log";
import type {
  Attachment as AttachmentContract,
  AttachmentId,
  AttachmentWebBinding,
  SessionTarget,
  WorkspaceId,
} from "./workspace";

const attachmentLog = createLogger("attachments");

/**
 * The runtime-internal surface an attachment closes over. Not part of the
 * WorkspaceRuntime contract: the host never sees these.
 */
export interface AttachmentOwner {
  readonly workspaceId: WorkspaceId;
  acquireAgentInstanceGuard(
    target: SessionTarget,
    openedManager?: SessionManager,
    origin?: string,
  ): Promise<AgentInstanceGuard>;
  prepareDispatch(
    context: Omit<AttachmentDispatchContext, "signal">,
    request: CanonicalRequest,
    disposeOperationGuard: () => void,
  ): PreparedDispatch;
  registerWebBinding(
    targetGuard: AgentInstanceGuard,
  ): AttachmentWebBindingHandle;
  dropAttachment(attachment: Attachment): void;
}

interface AttachmentTargetState extends Disposable {
  readonly target: SessionTarget;
  readonly targetGuard: AgentInstanceGuard;
  readonly webBinding: AttachmentWebBinding;
}

function createAttachmentTargetState(
  owner: AttachmentOwner,
  targetGuard: AgentInstanceGuard,
): AttachmentTargetState {
  const lifetime = new DisposableStack();
  lifetime.use(targetGuard);
  try {
    const webBinding = lifetime.use(
      owner.registerWebBinding(targetGuard),
    ).binding;
    return {
      target: targetGuard.value.target,
      targetGuard,
      webBinding,
      [Symbol.dispose]: () => {
        lifetime.dispose();
      },
    };
  } catch (error) {
    lifetime.dispose();
    throw error;
  }
}

/** One runtime-created attachment object. */
export class Attachment implements AttachmentContract {
  readonly #owner: AttachmentOwner;
  readonly #webBindingListeners = new Set<
    (binding: AttachmentWebBinding) => void
  >();
  readonly #eventListeners = new Set<(event: RuntimeEvent) => void>();
  readonly #closeListeners = new Set<() => void>();
  readonly attachmentId: AttachmentId;
  readonly workspaceId: WorkspaceId;
  #targetState: AttachmentTargetState;
  #disposed = false;

  constructor(
    owner: AttachmentOwner,
    attachmentId: AttachmentId,
    targetGuard: AgentInstanceGuard,
  ) {
    this.#owner = owner;
    this.attachmentId = attachmentId;
    this.workspaceId = owner.workspaceId;
    this.#targetState = createAttachmentTargetState(owner, targetGuard);
  }

  get target(): SessionTarget {
    return this.#targetState.target;
  }

  get webBinding(): AttachmentWebBinding {
    return this.#targetState.webBinding;
  }

  prepareDispatch(request: CanonicalRequest): PreparedDispatch {
    if (this.#disposed) throw new Error("Attachment is disposed");
    const operationGuard = this.#targetState.targetGuard.retain("dispatch");
    const acceptedTarget = operationGuard.value.target;
    return this.#owner.prepareDispatch(
      {
        workspaceId: this.workspaceId,
        attachmentId: this.attachmentId,
        target: acceptedTarget,
        agentInstanceGuard: operationGuard,
        retarget: (target, openedManager) =>
          this.#retargetAndGuard(target, openedManager, true),
      },
      request,
      () => {
        operationGuard[Symbol.dispose]();
      },
    );
  }

  async retarget(target: SessionTarget): Promise<void> {
    using _retargetGuard = await this.#retargetAndGuard(
      target,
      undefined,
      false,
    );
  }

  onWebBindingChange(
    listener: (binding: AttachmentWebBinding) => void,
  ): Disposable {
    if (this.#disposed) throw new Error("Attachment is disposed");
    this.#webBindingListeners.add(listener);
    return disposable(() => this.#webBindingListeners.delete(listener));
  }

  onEvent(listener: (event: RuntimeEvent) => void): Disposable {
    if (this.#disposed) throw new Error("Attachment is disposed");
    this.#eventListeners.add(listener);
    return disposable(() => this.#eventListeners.delete(listener));
  }

  onClose(listener: () => void): Disposable {
    if (this.#disposed) {
      listener();
      return disposable(() => undefined);
    }
    this.#closeListeners.add(listener);
    return disposable(() => this.#closeListeners.delete(listener));
  }

  deliver(event: RuntimeEvent): void {
    if (this.#disposed) return;
    for (const listener of this.#eventListeners) listener(event);
  }

  [Symbol.dispose](): void {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#owner.dropAttachment(this);
    this.#targetState[Symbol.dispose]();
    this.#webBindingListeners.clear();
    this.#eventListeners.clear();
    for (const listener of this.#closeListeners) listener();
    this.#closeListeners.clear();
  }

  async #retargetAndGuard(
    target: SessionTarget,
    openedManager: SessionManager | undefined,
    allowClosed: boolean,
  ): Promise<AgentInstanceGuard> {
    if (this.#disposed && !allowClosed) {
      throw new Error("Attachment is disposed");
    }
    const next = await this.#owner.acquireAgentInstanceGuard(
      target,
      openedManager,
      "attachment",
    );
    if (this.#disposed) {
      if (allowClosed) return next;
      next[Symbol.dispose]();
      throw new Error("Attachment is disposed");
    }
    const nextTargetState = createAttachmentTargetState(this.#owner, next);
    const previousTargetState = this.#targetState;
    this.#targetState = nextTargetState;
    previousTargetState[Symbol.dispose]();
    for (const listener of this.#webBindingListeners) {
      try {
        listener(nextTargetState.webBinding);
      } catch (thrown) {
        const error =
          thrown instanceof Error ? thrown : new Error(String(thrown));
        attachmentLog.error(
          { attachmentId: this.attachmentId, err: error.message },
          "web_binding_listener_failed",
        );
      }
    }
    return nextTargetState.targetGuard.retain("retarget-response");
  }
}
