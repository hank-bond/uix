import { describe, expect, it, vi } from "vitest";

import type { SessionSummary } from "@uix/api/agent-channels";

import { WorkspaceSessionController } from "./session-controller";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

const newSession: SessionSummary = {
  sessionId: "session-2",
  displayLabel: "New conversation",
  createdAt: "2026-07-19T11:00:00.000Z",
  modifiedAt: "2026-07-19T11:00:00.000Z",
};

describe("WorkspaceSessionController", () => {
  it("publishes the new active session only after the backend responds", async () => {
    const response = deferred<SessionSummary>();
    const request = vi.fn(() => response.promise);
    const controller = new WorkspaceSessionController(request);
    const listener = vi.fn();
    const unsubscribe = controller.subscribe(listener);

    const transition = controller.newSession();
    expect(controller.getActiveSessionSnapshot()).toBeUndefined();
    expect(listener).not.toHaveBeenCalled();

    response.resolve(newSession);
    await expect(transition).resolves.toEqual(newSession);
    expect(controller.getActiveSessionSnapshot()).toEqual(newSession);
    expect(listener).toHaveBeenCalledOnce();

    unsubscribe();
    await controller.newSession();
    expect(listener).toHaveBeenCalledOnce();
  });

  it("tracks agent activity independently from Chat", () => {
    const controller = new WorkspaceSessionController(() =>
      Promise.resolve(newSession),
    );

    expect(controller.isAgentRunning()).toBe(false);
    controller.updateAgentActivity({ type: "agent_start" });
    expect(controller.isAgentRunning()).toBe(true);
    controller.updateAgentActivity({ type: "turn_end" });
    expect(controller.isAgentRunning()).toBe(true);
    controller.updateAgentActivity({ type: "agent_end" });
    expect(controller.isAgentRunning()).toBe(false);
  });

  it("keeps the prior active session when the request fails", async () => {
    const responses = [
      Promise.resolve(newSession),
      Promise.reject(new Error("transition failed")),
    ];
    const controller = new WorkspaceSessionController(() => {
      const response = responses.shift();
      if (!response) throw new Error("Missing response");
      return response;
    });
    await controller.newSession();

    await expect(controller.newSession()).rejects.toThrow("transition failed");
    expect(controller.getActiveSessionSnapshot()).toEqual(newSession);
  });
});
