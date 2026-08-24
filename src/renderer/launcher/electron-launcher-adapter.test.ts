import { describe, expect, it, vi } from "vitest";

import {
  Channels,
  type ChannelTransport,
  type LauncherActionResult,
  type LauncherState,
} from "#shared/ipc";

import { createElectronLauncherAdapter } from "./electron-launcher-adapter";

function createTransport(
  request: (channel: string, payload: unknown) => Promise<unknown>,
): ChannelTransport {
  return {
    request,
    subscribe: vi.fn(),
    reload: vi.fn(),
  };
}

describe("createElectronLauncherAdapter", () => {
  it("projects Electron recents through opaque launcher fields", async () => {
    const state: LauncherState = {
      recents: [
        {
          manifestPath: "/work/reports/uix.workspace.json",
          name: "Reports",
          openedAt: "2026-09-01T00:00:00.000Z",
        },
      ],
    };
    const request = vi.fn(() => Promise.resolve(state));
    const adapter = createElectronLauncherAdapter(createTransport(request));

    await expect(adapter.listWorkspaces()).resolves.toEqual([
      {
        id: "/work/reports/uix.workspace.json",
        name: "Reports",
        description: "/work/reports/uix.workspace.json",
      },
    ]);
    expect(request).toHaveBeenCalledWith(Channels.launcherState, undefined);
  });

  it("maps open and create actions onto Electron launcher requests", async () => {
    const accepted: LauncherActionResult = { ok: true };
    const request = vi.fn(() => Promise.resolve(accepted));
    const adapter = createElectronLauncherAdapter(createTransport(request));

    await expect(adapter.openWorkspace("workspace-1")).resolves.toBe(
      "accepted",
    );
    await expect(adapter.createWorkspace?.({ name: "Demo" })).resolves.toBe(
      "accepted",
    );
    expect(request).toHaveBeenNthCalledWith(1, Channels.launcherOpen, {
      manifestPath: "workspace-1",
    });
    expect(request).toHaveBeenNthCalledWith(2, Channels.launcherCreate, {
      name: "Demo",
    });
  });

  it("preserves cancellation and surfaces host errors", async () => {
    const request = vi
      .fn<(channel: string, payload: unknown) => Promise<unknown>>()
      .mockResolvedValueOnce({ ok: false, canceled: true })
      .mockResolvedValueOnce({ ok: false, error: "could not open" });
    const adapter = createElectronLauncherAdapter(createTransport(request));

    await expect(adapter.openWorkspace("workspace-1")).resolves.toBe(
      "canceled",
    );
    await expect(adapter.openWorkspace("workspace-2")).rejects.toThrow(
      "could not open",
    );
  });
});
