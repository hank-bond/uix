// Tracks an attachment's binding as snapshots with increasing revisions.

import type { Attachment } from "@uix/runtime";

import {
  type AttachmentWebBindingSnapshot,
  parseAttachmentWebBindingSnapshot,
} from "../channel-transport";

export class AttachmentWebBindingState implements Disposable {
  readonly #subscription: Disposable;
  #snapshot: AttachmentWebBindingSnapshot;

  constructor(
    attachment: Pick<
      Attachment,
      "workspaceId" | "webBinding" | "onWebBindingChange"
    >,
    snapshotListener: (snapshot: AttachmentWebBindingSnapshot) => void,
  ) {
    this.#snapshot = parseAttachmentWebBindingSnapshot({
      revision: 0,
      workspaceId: attachment.workspaceId,
      binding: attachment.webBinding,
    });
    this.#subscription = attachment.onWebBindingChange((binding) => {
      this.#snapshot = parseAttachmentWebBindingSnapshot({
        ...this.#snapshot,
        revision: this.#snapshot.revision + 1,
        binding,
      });
      snapshotListener(this.#snapshot);
    });
  }

  get snapshot(): AttachmentWebBindingSnapshot {
    return this.#snapshot;
  }

  [Symbol.dispose](): void {
    this.#subscription[Symbol.dispose]();
  }
}
