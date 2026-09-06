// Maintains current feature-root addresses from ordered WebSocket binding updates.

import type {
  AttachmentWebRootsObservable,
  AttachmentWebRootsSnapshot,
} from "@uix/client/workspace";

import { encodeFeatureWebRoot } from "../viewpoint-urls";

/**
 * Own root replacement behind a read-only observation capability.
 *
 * Set the accepted socket's binding before consumers read their first snapshot.
 * Dispose the owner to stop observation. Previously returned snapshots remain fixed.
 */
export class AttachmentWebRootsState
  implements AttachmentWebRootsObservable, Disposable
{
  readonly #listeners = new Set<() => void>();
  readonly #publicOrigin: string;
  readonly #workspaceId: string;
  #snapshot: AttachmentWebRootsSnapshot | undefined;
  #isDisposed = false;

  constructor(publicOrigin: string, workspaceId: string) {
    this.#publicOrigin = publicOrigin;
    this.#workspaceId = workspaceId;
  }

  /** Apply only validated messages from the currently accepted socket. */
  setBinding(binding: string): void {
    if (this.#isDisposed) throw new Error("Attachment web roots are disposed");
    const publicOrigin = this.#publicOrigin;
    const workspaceId = this.#workspaceId;
    this.#snapshot = Object.freeze({
      toFeatureRootUrl: (featureId: string) =>
        encodeFeatureWebRoot({ publicOrigin, workspaceId, binding, featureId }),
    });
    for (const listener of this.#listeners) listener();
  }

  readonly getSnapshot = (): AttachmentWebRootsSnapshot => {
    if (!this.#snapshot)
      throw new Error("Attachment web roots have not bootstrapped");
    return this.#snapshot;
  };

  readonly subscribe = (listener: () => void): (() => void) => {
    if (this.#isDisposed) throw new Error("Attachment web roots are disposed");
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  };

  [Symbol.dispose](): void {
    this.#isDisposed = true;
    this.#listeners.clear();
  }
}
