// Owns private web bindings that retain one attachment-target generation until revocation.

import { randomBytes } from "node:crypto";

import type { AgentInstanceGuard } from "./agent/instance-supervisor";
import type { AttachmentWebBinding } from "./workspace";

interface RegisteredAttachmentWebBinding {
  readonly targetGuard: AgentInstanceGuard;
}

/** Scoped capability for one live attachment-target web binding. */
export interface AttachmentWebBindingHandle extends Disposable {
  readonly binding: AttachmentWebBinding;
}

/** Runtime-private lookup for attachment-target web bindings. */
export class AttachmentWebBindingRegistry implements Disposable {
  readonly #bindings = new Map<
    AttachmentWebBinding,
    RegisteredAttachmentWebBinding
  >();
  readonly #issuedBindings = new Set<AttachmentWebBinding>();
  #isDisposed = false;

  register(targetGuard: AgentInstanceGuard): AttachmentWebBindingHandle {
    if (this.#isDisposed) {
      throw new Error("Attachment web binding registry is disposed");
    }

    let binding: AttachmentWebBinding;
    do {
      binding = randomBytes(16).toString("base64url") as AttachmentWebBinding;
    } while (this.#issuedBindings.has(binding));
    this.#issuedBindings.add(binding);

    const registeredBinding = {
      targetGuard: targetGuard.retain("attachment-web-binding"),
    };
    this.#bindings.set(binding, registeredBinding);

    let isDisposed = false;
    return {
      binding,
      [Symbol.dispose]: () => {
        if (isDisposed) return;
        isDisposed = true;
        if (this.#bindings.get(binding) !== registeredBinding) return;
        this.#bindings.delete(binding);
        registeredBinding.targetGuard[Symbol.dispose]();
      },
    };
  }

  /** Retain the target only when the presented binding is still live. */
  retainTarget(
    binding: string,
    origin = "attachment-web-request",
  ): AgentInstanceGuard | undefined {
    if (this.#isDisposed) return undefined;
    return this.#bindings
      .get(binding as AttachmentWebBinding)
      ?.targetGuard.retain(origin);
  }

  [Symbol.dispose](): void {
    if (this.#isDisposed) return;
    this.#isDisposed = true;
    const registeredBindings = [...this.#bindings.values()];
    this.#bindings.clear();
    for (const registeredBinding of registeredBindings) {
      registeredBinding.targetGuard[Symbol.dispose]();
    }
  }
}
