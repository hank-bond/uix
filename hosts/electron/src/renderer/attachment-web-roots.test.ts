import { describe, expect, it, vi } from "vitest";

import { createAttachmentWebRootsObservable } from "./attachment-web-roots";
import type { AttachmentWebBindingSnapshot } from "../channel-transport";

const initial: AttachmentWebBindingSnapshot = {
  revision: 0,
  workspaceId: "local",
  binding: "initial",
};
const replacement: AttachmentWebBindingSnapshot = {
  ...initial,
  revision: 1,
  binding: "replacement",
};

describe("Electron attachment web roots", () => {
  it("subscribes before bootstrap and does not roll back a newer push", async () => {
    let snapshotListener: (
      snapshot: AttachmentWebBindingSnapshot,
    ) => void = () => {
      throw new Error("Not subscribed");
    };
    const unsubscribe = vi.fn();
    using roots = createAttachmentWebRootsObservable({
      subscribe(listener) {
        snapshotListener = listener;
        return unsubscribe;
      },
      read() {
        snapshotListener(replacement);
        return Promise.resolve(initial);
      },
    });
    await roots.ready;
    expect(roots.getSnapshot().toFeatureRootUrl("canvas")).toBe(
      "uix-resource://canvas.viewpoint.local/replacement/",
    );
    const listener = vi.fn();
    const stop = roots.subscribe(listener);
    const oldRoots = roots.getSnapshot();
    snapshotListener(initial);
    snapshotListener(replacement);
    expect(roots.getSnapshot()).toBe(oldRoots);
    expect(listener).not.toHaveBeenCalled();
    snapshotListener({ ...replacement, revision: 2, binding: "next" });
    expect(listener).toHaveBeenCalledOnce();
    expect(roots.getSnapshot()).not.toBe(oldRoots);
    expect(oldRoots.toFeatureRootUrl("canvas")).toContain("/replacement/");
    expect(roots.getSnapshot().toFeatureRootUrl("canvas")).toContain("/next/");
    stop();
    snapshotListener({ ...replacement, revision: 3, binding: "last" });
    expect(listener).toHaveBeenCalledOnce();
    roots[Symbol.dispose]();
    roots[Symbol.dispose]();
    expect(unsubscribe).toHaveBeenCalledOnce();
  });

  it("releases observation when bootstrap fails", async () => {
    const unsubscribe = vi.fn();
    using roots = createAttachmentWebRootsObservable({
      subscribe: () => unsubscribe,
      read: () => Promise.reject(new Error("Window closed")),
    });
    await expect(roots.ready).rejects.toThrow("Window closed");
    expect(unsubscribe).toHaveBeenCalledOnce();
    expect(() => roots.subscribe(vi.fn())).toThrow("disposed");
  });

  it("disposes observation during a pending read and rejects its late state", async () => {
    let readCompletion: (
      snapshot: AttachmentWebBindingSnapshot,
    ) => void = () => {
      throw new Error("Read not started");
    };
    const pending = new Promise<AttachmentWebBindingSnapshot>((resolve) => {
      readCompletion = resolve;
    });
    const unsubscribe = vi.fn();
    using roots = createAttachmentWebRootsObservable({
      subscribe: () => unsubscribe,
      read: () => pending,
    });
    const listener = vi.fn();
    roots.subscribe(listener);
    roots[Symbol.dispose]();
    expect(unsubscribe).toHaveBeenCalledOnce();
    readCompletion(initial);
    await roots.ready;
    expect(listener).not.toHaveBeenCalled();
    expect(() => roots.getSnapshot()).toThrow("have not bootstrapped");
  });

  it("preserves a late bootstrap failure after disposal without repeating cleanup", async () => {
    let readFailure: (error: Error) => void = () => {
      throw new Error("Read not started");
    };
    const pending = new Promise<AttachmentWebBindingSnapshot>(
      (_resolve, reject) => {
        readFailure = reject;
      },
    );
    const unsubscribe = vi.fn();
    using roots = createAttachmentWebRootsObservable({
      subscribe: () => unsubscribe,
      read: () => pending,
    });
    roots[Symbol.dispose]();
    readFailure(new Error("Read failed"));
    await expect(roots.ready).rejects.toThrow("Read failed");
    expect(unsubscribe).toHaveBeenCalledOnce();
  });
});
