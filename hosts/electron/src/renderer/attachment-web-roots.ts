// Observes Electron attachment web roots with immediate ownership of bootstrap cleanup.

import type {
  AttachmentWebRootsObservable,
  AttachmentWebRootsSnapshot,
} from "@uix/client/workspace";

import type {
  AttachmentWebBindingSnapshot,
  AttachmentWebBindingTransport,
} from "../channel-transport";
import { encodeFeatureWebRoot } from "../viewpoint-urls";

/**
 * Own the returned observable immediately, then await `ready` before reading its snapshot.
 * Subscription precedes the bootstrap read, so a delayed response cannot undo a newer push.
 * Disposal stops observation even while that read is pending and prevents its late commit.
 */
export function createAttachmentWebRootsObservable(
  transport: AttachmentWebBindingTransport,
): AttachmentWebRootsObservable &
  Disposable & { readonly ready: Promise<void> } {
  const lifetime = new DisposableStack();
  let current: AttachmentWebBindingSnapshot | undefined;
  let roots: AttachmentWebRootsSnapshot | undefined;
  const listeners = new Set<() => void>();
  lifetime.defer(() => {
    listeners.clear();
  });
  const commitSnapshot = (snapshot: AttachmentWebBindingSnapshot): void => {
    if (lifetime.disposed || (current && snapshot.revision <= current.revision))
      return;
    current = snapshot;
    roots = {
      toFeatureRootUrl: (featureId) =>
        encodeFeatureWebRoot({
          workspaceId: snapshot.workspaceId,
          binding: snapshot.binding,
          featureId,
        }),
    };
    for (const listener of listeners) listener();
  };
  lifetime.defer(transport.subscribe(commitSnapshot));
  // Readiness is one write-once completion, not authority for the changing roots.
  const ready = (async (): Promise<void> => {
    try {
      commitSnapshot(await transport.read());
    } catch (error) {
      lifetime.dispose();
      throw error;
    }
  })();
  return {
    ready,
    getSnapshot: () => {
      if (!roots) throw new Error("Electron web roots have not bootstrapped");
      return roots;
    },
    subscribe: (listener) => {
      if (lifetime.disposed) throw new Error("Electron web roots are disposed");
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    [Symbol.dispose]: () => {
      lifetime.dispose();
    },
  };
}
