import { describe, expect, it, vi } from "vitest";

import { normalizeActionContribution } from "./action-normalization";
import { createWorkspaceSessionActions } from "./session-actions";

describe("workspace session actions", () => {
  it("registers New Session under the substrate owner with mod+n", () => {
    const normalized = normalizeActionContribution(
      "uix",
      createWorkspaceSessionActions({
        isAgentRunning: () => false,
        newSession: () => Promise.resolve(),
      }),
    );

    expect(normalized.catalogEntries).toMatchObject([
      {
        id: "uix.session.new",
        owner: "uix",
        title: "New Session",
        path: ["Session", "New Session"],
      },
    ]);
    expect(normalized.defaultBindings).toEqual({
      "uix.session.new": "mod+n",
    });
  });

  it("invokes the controller only while the agent is idle", async () => {
    let agentRunning = true;
    const newSession = vi.fn(() => Promise.resolve());
    const normalized = normalizeActionContribution(
      "uix",
      createWorkspaceSessionActions({
        isAgentRunning: () => agentRunning,
        newSession,
      }),
    );
    const run = normalized.registrations[0]?.run;
    if (!run) throw new Error("New Session action is missing");

    await run();
    expect(newSession).not.toHaveBeenCalled();

    agentRunning = false;
    await run();
    expect(newSession).toHaveBeenCalledOnce();
  });
});
