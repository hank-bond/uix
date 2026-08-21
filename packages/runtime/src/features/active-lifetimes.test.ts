import { describe, expect, it, vi } from "vitest";

import { ActiveFeatureLifetimeOwner } from "./active-lifetimes";

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe("ActiveFeatureLifetimeOwner", () => {
  it("awaits mixed previous-generation cleanup before admitting replacements", async () => {
    const gate = deferred();
    const order: string[] = [];
    const owner = new ActiveFeatureLifetimeOwner();
    owner.add({
      [Symbol.dispose]() {
        order.push("first");
      },
    });
    owner.add({
      async [Symbol.asyncDispose]() {
        order.push("second-started");
        await gate.promise;
        order.push("second-finished");
      },
    });

    const replacement = owner.replace();
    await vi.waitFor(() => {
      expect(order).toEqual(["second-started"]);
    });
    expect(() => owner.add({ [Symbol.dispose]() {} })).toThrow(
      "being replaced",
    );

    gate.resolve();
    await replacement;
    expect(order).toEqual(["second-started", "second-finished", "first"]);

    owner.add({
      [Symbol.dispose]() {
        order.push("replacement");
      },
    });
    await owner[Symbol.asyncDispose]();
    expect(order.at(-1)).toBe("replacement");
  });

  it("shutdown joins a replacement already in progress", async () => {
    const gate = deferred();
    const owner = new ActiveFeatureLifetimeOwner();
    owner.add({
      async [Symbol.asyncDispose]() {
        await gate.promise;
      },
    });

    const replacement = owner.replace();
    let shutdownFinished = false;
    const disposal = owner[Symbol.asyncDispose]();
    expect(owner[Symbol.asyncDispose]()).toBe(disposal);
    const observedDisposal = disposal.then(() => {
      shutdownFinished = true;
    });
    expect(() => owner.add({ [Symbol.dispose]() {} })).toThrow("disposing");
    await Promise.resolve();
    expect(shutdownFinished).toBe(false);

    gate.resolve();
    await Promise.all([replacement, observedDisposal]);
    expect(shutdownFinished).toBe(true);
  });

  it("continues with a fresh generation after replacement cleanup fails", async () => {
    const owner = new ActiveFeatureLifetimeOwner();
    owner.add({
      [Symbol.asyncDispose]: () => Promise.reject(new Error("cleanup failed")),
    });

    await expect(owner.replace()).rejects.toThrow(
      "Async disposable bag disposal failed",
    );

    const dispose = vi.fn();
    owner.add({ [Symbol.dispose]: dispose });
    await owner[Symbol.asyncDispose]();
    expect(dispose).toHaveBeenCalledOnce();
  });
});
