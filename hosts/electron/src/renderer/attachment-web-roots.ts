// Maintains current feature-root addresses from attachment binding updates.

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
 * Add the returned observable to the caller's lifetime before awaiting initialization.
 *
 * - Await the `ready` promise before reading the snapshot.
 * - Read subsequent snapshots to observe target changes. The observable rejects older revisions.
 * - Dispose the observable to stop observation, even during the initial read. A pending response cannot update the snapshot after disposal.
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
  // Subscribe before reading so target changes cannot be missed during initialization.
  lifetime.defer(transport.subscribe(commitSnapshot));
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
