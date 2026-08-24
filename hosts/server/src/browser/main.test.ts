import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { LauncherAdapter } from "@uix/client/launcher";

const client = vi.hoisted(() => ({
  dispose: vi.fn(),
  mountLauncherClient: vi.fn(),
}));

vi.mock("@uix/client/launcher", () => ({
  mountLauncherClient: client.mountLauncherClient,
}));

describe("server launcher bootstrap", () => {
  beforeEach(() => {
    vi.resetModules();
    client.dispose.mockReset();
    client.mountLauncherClient.mockReset();
    client.mountLauncherClient.mockReturnValue({
      [Symbol.dispose]: client.dispose,
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("fetches the catalog, mounts the shared client, navigates, and disposes on pagehide", async () => {
    const target = {} as HTMLElement;
    const assign = vi.fn();
    let pagehide: (() => void) | undefined;
    const fetchCatalog = vi.fn(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            version: 1,
            workspaces: [
              {
                id: "reference",
                name: "Reference workspace",
                location: "https://uix.example/w/reference",
              },
            ],
          }),
          { headers: { "Content-Type": "application/json" } },
        ),
      ),
    );

    vi.stubGlobal("document", {
      getElementById: vi.fn(() => target),
    });
    vi.stubGlobal("window", {
      location: { assign },
      addEventListener: vi.fn(
        (type: string, listener: () => void, options?: { once?: boolean }) => {
          if (type === "pagehide" && options?.once) pagehide = listener;
        },
      ),
    });
    vi.stubGlobal("fetch", fetchCatalog);

    await import("./main");

    expect(client.mountLauncherClient).toHaveBeenCalledOnce();
    const mountOptions = client.mountLauncherClient.mock.calls[0]?.[0] as {
      readonly target: HTMLElement;
      readonly adapter: LauncherAdapter;
    };
    expect(mountOptions.target).toBe(target);
    await expect(mountOptions.adapter.listWorkspaces()).resolves.toEqual([
      { id: "reference", name: "Reference workspace" },
    ]);
    expect(fetchCatalog).toHaveBeenCalledWith("/api/catalog", {
      headers: { Accept: "application/json" },
    });

    await expect(mountOptions.adapter.openWorkspace("reference")).resolves.toBe(
      "accepted",
    );
    expect(assign).toHaveBeenCalledWith("https://uix.example/w/reference");

    expect(pagehide).toBeDefined();
    pagehide?.();
    expect(client.dispose).toHaveBeenCalledOnce();
  });
});
