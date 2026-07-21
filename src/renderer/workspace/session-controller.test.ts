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

const existingSession: SessionSummary = {
  sessionId: "session-1",
  displayLabel: "Existing conversation",
  createdAt: "2026-07-19T10:00:00.000Z",
  modifiedAt: "2026-07-19T10:30:00.000Z",
};

const newSession: SessionSummary = {
  sessionId: "session-2",
  displayLabel: "New conversation",
  createdAt: "2026-07-19T11:00:00.000Z",
  modifiedAt: "2026-07-19T11:00:00.000Z",
};

function createController(
  requestNewSession: () => Promise<SessionSummary> = () =>
    Promise.resolve(newSession),
) {
  return new WorkspaceSessionController({
    requestActiveHistory: () =>
      Promise.resolve({
        session: existingSession,
        transcript: { items: [] },
      }),
    requestNewSession,
  });
}

describe("WorkspaceSessionController", () => {
  it("publishes the new active session only after the backend responds", async () => {
    const response = deferred<SessionSummary>();
    const request = vi.fn(() => response.promise);
    const controller = createController(request);
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

  it("hydrates the active summary and shares an equivalent in-flight read", async () => {
    const response = deferred<{
      session: SessionSummary;
      transcript: { items: [] };
    }>();
    const requestActiveHistory = vi.fn(() => response.promise);
    const controller = new WorkspaceSessionController({
      requestActiveHistory,
      requestNewSession: () => Promise.resolve(newSession),
    });

    const first = controller.loadActiveHistory();
    const second = controller.loadActiveHistory();
    expect(requestActiveHistory).toHaveBeenCalledOnce();

    response.resolve({
      session: existingSession,
      transcript: { items: [] },
    });
    await expect(Promise.all([first, second])).resolves.toEqual([
      { items: [] },
      { items: [] },
    ]);
    expect(controller.getActiveSessionSnapshot()).toEqual(existingSession);
    expect(controller.getSessionSelectionVersion()).toBe(0);
  });

  it("does not let an older history read replace a successful mutation", async () => {
    const historyResponse = deferred<{
      session: SessionSummary;
      transcript: { items: [] };
    }>();
    const controller = new WorkspaceSessionController({
      requestActiveHistory: () => historyResponse.promise,
      requestNewSession: () => Promise.resolve(newSession),
    });

    const history = controller.loadActiveHistory();
    await controller.newSession();
    historyResponse.resolve({
      session: existingSession,
      transcript: { items: [] },
    });
    await history;

    expect(controller.getActiveSessionSnapshot()).toEqual(newSession);
    expect(controller.getSessionSelectionVersion()).toBe(1);
  });

  it("tracks agent activity independently from Chat", () => {
    const controller = createController();

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
    const controller = createController(() => {
      const response = responses.shift();
      if (!response) throw new Error("Missing response");
      return response;
    });
    await controller.newSession();

    await expect(controller.newSession()).rejects.toThrow("transition failed");
    expect(controller.getActiveSessionSnapshot()).toEqual(newSession);
  });
});
