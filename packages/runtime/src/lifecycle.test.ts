import { describe, expect, it, vi } from "vitest";

import { AsyncDisposableBag } from "./lifecycle";

describe("AsyncDisposableBag", () => {
  it("disposes mixed lifetimes in reverse acquisition order", async () => {
    const order: string[] = [];
    const bag = new AsyncDisposableBag();
    bag.add({
      [Symbol.dispose]() {
        order.push("first");
      },
    });
    bag.add({
      async [Symbol.asyncDispose]() {
        await Promise.resolve();
        order.push("second");
      },
    });

    await bag[Symbol.asyncDispose]();

    expect(order).toEqual(["second", "first"]);
  });

  it("awaits a clear and accepts replacement lifetimes", async () => {
    const order: string[] = [];
    const bag = new AsyncDisposableBag();
    bag.add({
      [Symbol.asyncDispose]: async () => {
        await Promise.resolve();
        order.push("old");
      },
    });

    await bag.clear();
    bag.add({
      [Symbol.dispose]: () => {
        order.push("replacement");
      },
    });
    await bag[Symbol.asyncDispose]();

    expect(order).toEqual(["old", "replacement"]);
  });

  it("joins idempotent disposal and rejects later additions", async () => {
    const dispose = vi.fn<() => Promise<void>>(() => Promise.resolve());
    const bag = new AsyncDisposableBag();
    bag.add({ [Symbol.asyncDispose]: dispose });

    const first = bag[Symbol.asyncDispose]();
    expect(bag[Symbol.asyncDispose]()).toBe(first);
    expect(() => bag.add({ [Symbol.dispose]() {} })).toThrow("disposed");

    await first;
    expect(dispose).toHaveBeenCalledOnce();
  });

  it("continues teardown and aggregates failures", async () => {
    const finalDispose = vi.fn();
    const bag = new AsyncDisposableBag();
    bag.add({ [Symbol.dispose]: finalDispose });
    bag.add({
      [Symbol.asyncDispose]: () => Promise.reject(new Error("failed")),
    });

    await expect(bag[Symbol.asyncDispose]()).rejects.toThrow(
      "Async disposable bag disposal failed",
    );
    expect(finalDispose).toHaveBeenCalledOnce();
  });
});
