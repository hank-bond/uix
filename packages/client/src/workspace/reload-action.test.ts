import { describe, expect, it, vi } from "vitest";

import { resolveActionContribution } from "./action-resolution";
import { createWorkspaceReloadAction } from "./reload-action";

const reloadResult = {
  featuresActivated: 2,
  featuresFailed: 1,
  failures: [
    {
      feature: "broken",
      entry: "/workspace/broken.ts",
      error: "Missing dependency",
    },
  ],
  piResourcesReloaded: true,
};

describe("workspace reload action", () => {
  it("registers the substrate reload operation with its portable binding", () => {
    const resolved = resolveActionContribution(
      "uix",
      createWorkspaceReloadAction({
        reload: () => Promise.resolve(reloadResult),
      }),
    );

    expect(resolved.catalogEntries).toMatchObject([
      {
        id: "uix.reload",
        owner: "uix",
        title: "Reload Workspace",
        path: ["Reload Workspace"],
      },
    ]);
    expect(resolved.defaultBindings).toEqual({
      "uix.reload": "mod+r",
    });
  });

  it("awaits the canonical reload request", async () => {
    const reload = vi.fn(() => Promise.resolve(reloadResult));
    const resolved = resolveActionContribution(
      "uix",
      createWorkspaceReloadAction({ reload }),
    );

    await resolved.resolvedContributions[0]?.run();

    expect(reload).toHaveBeenCalledOnce();
  });
});
