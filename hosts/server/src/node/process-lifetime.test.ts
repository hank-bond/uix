import { describe, expect, it, vi } from "vitest";

import { ServerProcessLifetime } from "./process-lifetime";
import type { ServerHost } from "./server";

describe("server process lifetime", () => {
  it("disposes the committed host exactly once", async () => {
    const dispose = vi.fn(() => Promise.resolve());
    const lifetime = new ServerProcessLifetime();

    await expect(lifetime.commit(createHost(dispose))).resolves.toBe(true);
    await lifetime[Symbol.asyncDispose]();
    await lifetime[Symbol.asyncDispose]();

    expect(dispose).toHaveBeenCalledOnce();
  });

  it("disposes and joins a host that finishes starting after shutdown was requested", async () => {
    let releaseDisposal!: () => void;
    const disposalGate = new Promise<void>((resolve) => {
      releaseDisposal = resolve;
    });
    const dispose = vi.fn(() => disposalGate);
    const lifetime = new ServerProcessLifetime();

    await lifetime[Symbol.asyncDispose]();
    const commit = lifetime.commit(createHost(dispose));
    const joinedDisposal = lifetime[Symbol.asyncDispose]();
    await vi.waitFor(() => {
      expect(dispose).toHaveBeenCalledOnce();
    });
    let hasJoinedDisposal = false;
    void joinedDisposal.then(() => {
      hasJoinedDisposal = true;
    });
    await Promise.resolve();
    expect(hasJoinedDisposal).toBe(false);

    releaseDisposal();
    await expect(commit).resolves.toBe(false);
    await joinedDisposal;
    await expect(
      lifetime.commit(createHost(vi.fn(() => Promise.resolve()))),
    ).rejects.toThrow("already received");
  });
});

function createHost(dispose: () => Promise<void>): ServerHost {
  return {
    listen: () => Promise.reject(new Error("Unexpected listen")),
    [Symbol.asyncDispose]: dispose,
  };
}
