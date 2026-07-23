import { describe, expect, it, vi } from "vitest";

import type {
  SessionHistoryResponse,
  SessionSummary,
} from "@uix/api/agent-channels";

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

interface ControllerRequests {
  requestActiveHistory: () => Promise<SessionHistoryResponse>;
  requestRecentSessions: () => Promise<SessionSummary[]>;
  requestNewSession: () => Promise<SessionSummary>;
  requestSwitchSession: (sessionId: string) => Promise<SessionSummary>;
}

function createController(overrides: Partial<ControllerRequests> = {}) {
  return new WorkspaceSessionController({
    requestActiveHistory: () =>
      Promise.resolve({
        session: existingSession,
        transcript: { items: [] },
      }),
    requestRecentSessions: () => Promise.resolve([]),
    requestNewSession: () => Promise.resolve(newSession),
    requestSwitchSession: () => Promise.resolve(newSession),
    ...overrides,
  });
}

describe("WorkspaceSessionController", () => {
  it("publishes a new active session only after the backend responds", async () => {
    const response = deferred<SessionSummary>();
    const controller = createController({
      requestNewSession: () => response.promise,
    });
    const listener = vi.fn();
    const unsubscribe = controller.subscribe(listener);

    const transition = controller.newSession();
    expect(controller.getSnapshot()).toMatchObject({
      activeSession: undefined,
      sessionSelectionVersion: 0,
      isSessionMutationPending: true,
    });

    response.resolve(newSession);
    await expect(transition).resolves.toEqual(newSession);
    expect(controller.getSnapshot()).toMatchObject({
      activeSession: newSession,
      sessionSelectionVersion: 1,
      isSessionMutationPending: false,
    });
    expect(listener).toHaveBeenCalled();

    unsubscribe();
    const calls = listener.mock.calls.length;
    await controller.newSession();
    expect(listener).toHaveBeenCalledTimes(calls);
  });

  it("hydrates the active summary and shares an equivalent in-flight read", async () => {
    const response = deferred<SessionHistoryResponse>();
    const requestActiveHistory = vi.fn(() => response.promise);
    const controller = createController({ requestActiveHistory });

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
    expect(controller.getSnapshot()).toMatchObject({
      activeSession: existingSession,
      sessionSelectionVersion: 0,
    });
  });

  it("does not let an older history read replace a successful mutation", async () => {
    const historyResponse = deferred<SessionHistoryResponse>();
    const controller = createController({
      requestActiveHistory: () => historyResponse.promise,
    });

    const history = controller.loadActiveHistory();
    await controller.newSession();
    historyResponse.resolve({
      session: existingSession,
      transcript: { items: [] },
    });
    await history;

    expect(controller.getSnapshot()).toMatchObject({
      activeSession: newSession,
      sessionSelectionVersion: 1,
    });
  });

  it("applies only the latest recent-session request", async () => {
    const firstResponse = deferred<SessionSummary[]>();
    const secondResponse = deferred<SessionSummary[]>();
    const responses = [firstResponse.promise, secondResponse.promise];
    const controller = createController({
      requestRecentSessions: () => {
        const response = responses.shift();
        if (!response) throw new Error("Missing response");
        return response;
      },
    });

    const first = controller.loadRecentSessions();
    const second = controller.loadRecentSessions();
    secondResponse.resolve([newSession]);
    await second;
    expect(controller.getSnapshot().recentSessions).toEqual([newSession]);

    firstResponse.resolve([existingSession]);
    await first;
    expect(controller.getSnapshot().recentSessions).toEqual([newSession]);
  });

  it("switches through one mutation and refreshes recents independently", async () => {
    const switchResponse = deferred<SessionSummary>();
    const initialRecentResponse = deferred<SessionSummary[]>();
    const staleRecentResponse = deferred<SessionSummary[]>();
    const refreshedRecentResponse = deferred<SessionSummary[]>();
    const recentResponses = [
      initialRecentResponse.promise,
      staleRecentResponse.promise,
      refreshedRecentResponse.promise,
    ];
    const requestSwitchSession = vi.fn(() => switchResponse.promise);
    const controller = createController({
      requestRecentSessions: () => {
        const response = recentResponses.shift();
        if (!response) throw new Error("Missing response");
        return response;
      },
      requestSwitchSession,
    });

    const initialRecentLoad = controller.loadRecentSessions();
    initialRecentResponse.resolve([existingSession]);
    await initialRecentLoad;
    expect(controller.getSnapshot().recentSessions).toEqual([existingSession]);

    const staleRecentLoad = controller.loadRecentSessions();
    const switching = controller.switchSession(newSession.sessionId);
    expect(controller.canSwitchSession()).toBe(false);
    expect(requestSwitchSession).toHaveBeenCalledWith(newSession.sessionId);

    switchResponse.resolve(newSession);
    await expect(switching).resolves.toEqual(newSession);
    expect(controller.getSnapshot()).toMatchObject({
      activeSession: newSession,
      recentSessions: undefined,
      sessionSelectionVersion: 1,
      isSessionMutationPending: false,
    });

    staleRecentResponse.resolve([existingSession]);
    await staleRecentLoad;
    expect(controller.getSnapshot().recentSessions).toBeUndefined();

    refreshedRecentResponse.resolve([newSession, existingSession]);
    await vi.waitFor(() => {
      expect(controller.getSnapshot().recentSessions).toEqual([
        newSession,
        existingSession,
      ]);
    });
  });

  it("skips switching while the agent or another mutation is active", async () => {
    const switchResponse = deferred<SessionSummary>();
    const requestSwitchSession = vi.fn(() => switchResponse.promise);
    const controller = createController({ requestSwitchSession });

    controller.updateAgentActivity({ type: "agent_start" });
    await expect(
      controller.switchSession("session-2"),
    ).resolves.toBeUndefined();
    expect(requestSwitchSession).not.toHaveBeenCalled();

    controller.updateAgentActivity({ type: "agent_end" });
    const first = controller.switchSession("session-2");
    await expect(
      controller.switchSession("session-3"),
    ).resolves.toBeUndefined();
    expect(requestSwitchSession).toHaveBeenCalledOnce();

    switchResponse.resolve(newSession);
    await first;
  });

  it("returns the active row without requesting the same session", async () => {
    const requestSwitchSession = vi.fn(() => Promise.resolve(newSession));
    const controller = createController({ requestSwitchSession });
    await controller.loadActiveHistory();

    await expect(
      controller.switchSession(existingSession.sessionId),
    ).resolves.toEqual(existingSession);
    expect(requestSwitchSession).not.toHaveBeenCalled();
    expect(controller.getSnapshot().sessionSelectionVersion).toBe(0);
  });

  it("tracks agent activity reactively and independently from Chat", () => {
    const controller = createController();
    const listener = vi.fn();
    controller.subscribe(listener);

    expect(controller.isAgentRunning()).toBe(false);
    expect(controller.canSwitchSession()).toBe(true);
    controller.updateAgentActivity({ type: "agent_start" });
    expect(controller.isAgentRunning()).toBe(true);
    expect(controller.canSwitchSession()).toBe(false);
    expect(listener).toHaveBeenCalledOnce();

    controller.updateAgentActivity({ type: "turn_end" });
    expect(listener).toHaveBeenCalledOnce();
    controller.updateAgentActivity({ type: "agent_end" });
    expect(controller.isAgentRunning()).toBe(false);
    expect(controller.canSwitchSession()).toBe(true);
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("keeps the prior active session when a mutation fails", async () => {
    const responses = [
      Promise.resolve(newSession),
      Promise.reject(new Error("transition failed")),
    ];
    const controller = createController({
      requestNewSession: () => {
        const response = responses.shift();
        if (!response) throw new Error("Missing response");
        return response;
      },
    });
    await controller.newSession();

    await expect(controller.newSession()).rejects.toThrow("transition failed");
    expect(controller.getSnapshot()).toMatchObject({
      activeSession: newSession,
      sessionSelectionVersion: 1,
      isSessionMutationPending: false,
    });
  });
});
