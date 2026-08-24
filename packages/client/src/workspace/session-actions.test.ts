import { describe, expect, it, vi } from "vitest";

import { resolveActionContribution } from "./action-resolution";
import { createWorkspaceSessionActions } from "./session-actions";

describe("workspace session actions", () => {
  it("registers New Session under the substrate owner with mod+n", () => {
    const resolved = resolveActionContribution(
      "uix",
      createWorkspaceSessionActions({
        newSession: () => Promise.resolve(),
      }),
    );

    expect(resolved.catalogEntries).toMatchObject([
      {
        id: "uix.session.new",
        owner: "uix",
        title: "New Session",
        path: ["Session", "New Session"],
      },
    ]);
    expect(resolved.defaultBindings).toEqual({
      "uix.session.new": "mod+n",
    });
  });

  it("starts a new session while the selected session can keep running", async () => {
    const newSession = vi.fn(() => Promise.resolve());
    const resolved = resolveActionContribution(
      "uix",
      createWorkspaceSessionActions({ newSession }),
    );
    const run = resolved.resolvedContributions[0]?.run;

    await run();

    expect(newSession).toHaveBeenCalledOnce();
  });
});
