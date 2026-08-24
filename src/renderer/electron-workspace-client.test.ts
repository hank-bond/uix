import { describe, expect, it, vi } from "vitest";

import type { ChannelTransport } from "#shared/ipc";

import { createElectronWorkspaceClient } from "./electron-workspace-client";

describe("createElectronWorkspaceClient", () => {
  it("adapts preload requests and subscriptions", async () => {
    const unsubscribe = vi.fn();
    const request = vi.fn(() => Promise.resolve({ ok: true }));
    const subscribe = vi.fn(() => unsubscribe);
    const transport: ChannelTransport = {
      request,
      subscribe,
      reload: vi.fn(),
    };
    const client = createElectronWorkspaceClient(transport);
    const handler = vi.fn();

    await expect(
      client.request("reports.read", { id: "one" }),
    ).resolves.toEqual({ ok: true });
    expect(client.subscribe("reports.changed", handler)).toBe(unsubscribe);
    expect(client.workspaceId).toBe("local");
    expect(request).toHaveBeenCalledWith("reports.read", {
      id: "one",
    });
    expect(subscribe).toHaveBeenCalledWith("reports.changed", handler);
  });
});
