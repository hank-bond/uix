import { describe, expect, it, vi } from "vitest";

import { createServerLauncherAdapter } from "./launcher-adapter";

describe("server launcher adapter", () => {
  it("lists the public catalog and navigates to its canonical location", async () => {
    const readCatalog = vi.fn(() =>
      Promise.resolve({
        version: 1,
        workspaces: [
          {
            id: "reference",
            name: "Reference workspace",
            location: "https://uix.example/workspaces/reference",
          },
        ],
      }),
    );
    const setLocation = vi.fn();
    const adapter = createServerLauncherAdapter({
      readCatalog,
      setLocation,
    });

    await expect(adapter.listWorkspaces()).resolves.toEqual([
      { id: "reference", name: "Reference workspace" },
    ]);
    await expect(adapter.openWorkspace("reference")).resolves.toBe("accepted");

    expect(readCatalog).toHaveBeenCalledOnce();
    expect(setLocation).toHaveBeenCalledWith(
      "https://uix.example/workspaces/reference",
    );
    expect(adapter.createWorkspace).toBeUndefined();
  });

  it("rejects an id outside the catalog without navigation", async () => {
    const setLocation = vi.fn();
    const adapter = createServerLauncherAdapter({
      readCatalog: () => Promise.resolve({ version: 1, workspaces: [] }),
      setLocation,
    });

    await expect(adapter.openWorkspace("missing")).rejects.toThrow(
      "Unknown workspace: missing",
    );
    expect(setLocation).not.toHaveBeenCalled();
  });

  it("validates the catalog response before presenting it", async () => {
    const adapter = createServerLauncherAdapter({
      readCatalog: () => Promise.resolve({ version: 2, workspaces: [] }),
      setLocation: vi.fn(),
    });

    await expect(adapter.listWorkspaces()).rejects.toThrow();
  });
});
