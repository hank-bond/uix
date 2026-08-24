import { describe, expect, it, vi } from "vitest";

import { OperationTracker } from "./operation-tracker";

function deferred(): {
  readonly promise: Promise<void>;
  resolve(): void;
} {
  let resolve!: () => void;
  const promise = new Promise<void>((onResolve) => {
    resolve = onResolve;
  });
  return { promise, resolve };
}

describe("OperationTracker", () => {
  it("completes through lexical async disposal", async () => {
    const tracker = new OperationTracker();
    const operation = tracker.acquire();

    await operation[Symbol.asyncDispose]();

    await expect(tracker[Symbol.asyncDispose]()).resolves.toBeUndefined();
  });

  it("cancels one operation and waits for its lexical scope", async () => {
    const tracker = new OperationTracker();
    const operation = tracker.acquire();
    const stop = vi.fn(() => Promise.resolve());
    operation.onCancel(stop);

    let cancelled = false;
    const cancellation = operation.control.cancel("user").then(() => {
      cancelled = true;
    });
    await Promise.resolve();

    expect(operation.signal.aborted).toBe(true);
    expect(operation.signal.reason).toBe("user");
    expect(stop).toHaveBeenCalledOnce();
    expect(cancelled).toBe(false);

    await operation[Symbol.asyncDispose]();
    await cancellation;
    expect(cancelled).toBe(true);
    await tracker[Symbol.asyncDispose]();
  });

  it("invokes a cancellation adapter registered after cancellation", async () => {
    const tracker = new OperationTracker();
    const operation = tracker.acquire();
    void operation.control.cancel("early");
    const stop = vi.fn();

    operation.onCancel(stop);
    await Promise.resolve();

    expect(stop).toHaveBeenCalledOnce();
    await operation[Symbol.asyncDispose]();
    await tracker[Symbol.asyncDispose]();
  });

  it("parent disposal cancels operations and joins their scopes", async () => {
    const tracker = new OperationTracker();
    const operation = tracker.acquire();
    const stopObserved = deferred();
    operation.onCancel(() => {
      stopObserved.resolve();
    });

    let disposed = false;
    const disposal = tracker[Symbol.asyncDispose]().then(() => {
      disposed = true;
    });
    await stopObserved.promise;

    expect(operation.signal.aborted).toBe(true);
    expect(disposed).toBe(false);

    await operation[Symbol.asyncDispose]();
    await disposal;
    expect(disposed).toBe(true);
  });

  it("does not confuse a cancellation request with completion", async () => {
    const tracker = new OperationTracker();
    const operation = tracker.acquire();

    const disposal = tracker[Symbol.asyncDispose]();
    let disposed = false;
    void disposal.then(() => {
      disposed = true;
    });
    await Promise.resolve();

    expect(operation.signal.aborted).toBe(true);
    expect(disposed).toBe(false);

    await operation[Symbol.asyncDispose]();
    await disposal;
  });

  it("stops admission as soon as parent disposal begins", async () => {
    const tracker = new OperationTracker();
    const operation = tracker.acquire();

    const disposal = tracker[Symbol.asyncDispose]();
    expect(() => tracker.acquire()).toThrow("disposing");

    await operation[Symbol.asyncDispose]();
    await disposal;
  });

  it("runs one stop adapter for concurrent cancellation requests", async () => {
    const tracker = new OperationTracker();
    const operation = tracker.acquire();
    const stop = vi.fn();
    operation.onCancel(stop);

    const first = operation.control.cancel("first");
    const second = operation.control.cancel("second");
    await Promise.resolve();

    expect(stop).toHaveBeenCalledOnce();
    expect(operation.signal.reason).toBe("first");
    await operation[Symbol.asyncDispose]();
    await Promise.all([first, second]);
    await tracker[Symbol.asyncDispose]();
  });

  it("retains cancellation failures for callers and parent disposal", async () => {
    const tracker = new OperationTracker();
    const operation = tracker.acquire();
    operation.onCancel(() => {
      throw new Error("stop failed");
    });

    const cancellation = operation.control.cancel();
    await operation[Symbol.asyncDispose]();

    await expect(cancellation).rejects.toThrow("Operation cancellation failed");
    await expect(tracker[Symbol.asyncDispose]()).rejects.toThrow(
      "operation completions failed",
    );
  });
});
