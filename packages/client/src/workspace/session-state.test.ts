import { describe, expect, it, vi } from "vitest";

import type {
  SessionHistoryResponse,
  SessionSummary,
} from "@uix/api/agent-channels";

import { WorkspaceSessionState } from "./session-state";

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

const existingSession: SessionSummary = {
  sessionId: "session-1",
  title: "Existing conversation",
  createdAt: "2026-07-19T10:00:00.000Z",
  modifiedAt: "2026-07-19T10:30:00.000Z",
};

const newSession: SessionSummary = {
  sessionId: "session-2",
  createdAt: "2026-07-19T11:00:00.000Z",
  modifiedAt: "2026-07-19T11:00:00.000Z",
};

function historyResponse(
  session: SessionSummary = existingSession,
  turnActive = false,
): SessionHistoryResponse {
  return {
    session,
    snapshot: {
      transcript: { items: [] },
      turnActive,
    },
  };
}

interface SessionStateRequests {
  requestActiveHistory: () => Promise<SessionHistoryResponse>;
  requestRecentSessions: () => Promise<SessionSummary[]>;
  requestNewSession: () => Promise<SessionSummary>;
  requestSwitchSession: (sessionId: string) => Promise<SessionSummary>;
  requestSetSessionTitle: (
    sessionId: string,
    title: string | null,
  ) => Promise<SessionSummary>;
  synchronizeSessionLocation: (sessionId: string) => void;
}

function createSessionState(
  overrides: Partial<SessionStateRequests> = {},
): WorkspaceSessionState {
  return new WorkspaceSessionState({
    requestActiveHistory: () => Promise.resolve(historyResponse()),
    requestRecentSessions: () => Promise.resolve([]),
    requestNewSession: () => Promise.resolve(newSession),
    requestSwitchSession: () => Promise.resolve(newSession),
    requestSetSessionTitle: () => Promise.resolve(existingSession),
    ...overrides,
  });
}

describe("WorkspaceSessionState", () => {
  it("supports snapshot observation alongside session operations", () => {
    const sessionState = createSessionState();
    const previous = sessionState.getSnapshot();
    expect(sessionState.getSnapshot()).toBe(previous);

    const listener = vi.fn(() => sessionState.getSnapshot());
    const unsubscribe = sessionState.subscribe(listener);
    expect(listener).not.toHaveBeenCalled();

    sessionState.updateAgentActivity({ type: "agent_start" });
    const current = sessionState.getSnapshot();
    expect(current).not.toBe(previous);
    expect(current.isAgentRunning).toBe(true);
    expect(previous.isAgentRunning).toBe(false);
    expect(listener).toHaveBeenCalledExactlyOnceWith();
    expect(listener.mock.results[0]?.value).toBe(current);
    expect(sessionState.getSnapshot()).toBe(current);

    sessionState.updateAgentActivity({ type: "agent_start" });
    expect(sessionState.getSnapshot()).toBe(current);
    expect(listener).toHaveBeenCalledOnce();

    unsubscribe();
    sessionState.updateAgentActivity({ type: "agent_end" });
    expect(listener).toHaveBeenCalledOnce();
    expect(current.isAgentRunning).toBe(true);
  });

  it("updates the active session only after the backend responds", async () => {
    const response = deferred<SessionSummary>();
    const sessionState = createSessionState({
      requestNewSession: () => response.promise,
    });
    const listener = vi.fn();
    const unsubscribe = sessionState.subscribe(listener);

    const transition = sessionState.newSession();
    expect(sessionState.getSnapshot()).toMatchObject({
      activeSession: undefined,
      sessionSelectionVersion: 0,
      isSessionMutationPending: true,
    });

    response.resolve(newSession);
    await expect(transition).resolves.toEqual(newSession);
    expect(sessionState.getSnapshot()).toMatchObject({
      activeSession: newSession,
      sessionSelectionVersion: 1,
      isSessionMutationPending: false,
    });
    expect(listener).toHaveBeenCalled();

    unsubscribe();
    const calls = listener.mock.calls.length;
    await sessionState.newSession();
    expect(listener).toHaveBeenCalledTimes(calls);
  });

  it("hydrates the active summary and shares an equivalent in-flight read", async () => {
    const response = deferred<SessionHistoryResponse>();
    const requestActiveHistory = vi.fn(() => response.promise);
    const sessionState = createSessionState({ requestActiveHistory });

    const first = sessionState.loadActiveHistory();
    const second = sessionState.loadActiveHistory();
    expect(requestActiveHistory).toHaveBeenCalledOnce();

    response.resolve(historyResponse(existingSession, true));
    await expect(Promise.all([first, second])).resolves.toEqual([
      { transcript: { items: [] }, turnActive: true },
      { transcript: { items: [] }, turnActive: true },
    ]);
    expect(sessionState.getSnapshot()).toMatchObject({
      activeSession: existingSession,
      sessionSelectionVersion: 0,
    });
  });

  it("synchronizes each accepted session location once", async () => {
    const synchronizeSessionLocation = vi.fn();
    const sessionState = createSessionState({ synchronizeSessionLocation });

    await sessionState.loadActiveHistory();
    await sessionState.loadActiveHistory();
    await sessionState.newSession();

    expect(synchronizeSessionLocation.mock.calls).toEqual([
      [existingSession.sessionId],
      [newSession.sessionId],
    ]);
  });

  it("does not roll back an accepted session when location sync fails", async () => {
    const reportError = vi.fn();
    vi.stubGlobal("reportError", reportError);
    const locationError = new Error("location failed");
    const sessionState = createSessionState({
      synchronizeSessionLocation: () => {
        throw locationError;
      },
    });

    await expect(sessionState.newSession()).resolves.toEqual(newSession);
    expect(sessionState.getSnapshot().activeSession).toEqual(newSession);
    expect(reportError).toHaveBeenCalledWith(locationError);
    vi.unstubAllGlobals();
  });

  it("does not let an older history read replace a successful mutation", async () => {
    const pendingHistory = deferred<SessionHistoryResponse>();
    const sessionState = createSessionState({
      requestActiveHistory: () => pendingHistory.promise,
    });

    const history = sessionState.loadActiveHistory();
    await sessionState.newSession();
    pendingHistory.resolve(historyResponse());
    await history;

    expect(sessionState.getSnapshot()).toMatchObject({
      activeSession: newSession,
      sessionSelectionVersion: 1,
    });
  });

  it("applies only the latest recent-session request", async () => {
    const firstResponse = deferred<SessionSummary[]>();
    const secondResponse = deferred<SessionSummary[]>();
    const responses = [firstResponse.promise, secondResponse.promise];
    const sessionState = createSessionState({
      requestRecentSessions: () => {
        const response = responses.shift();
        if (!response) throw new Error("Missing response");
        return response;
      },
    });

    const first = sessionState.loadRecentSessions();
    const second = sessionState.loadRecentSessions();
    secondResponse.resolve([newSession]);
    await second;
    expect(sessionState.getSnapshot().recentSessions).toEqual([newSession]);

    firstResponse.resolve([existingSession]);
    await first;
    expect(sessionState.getSnapshot().recentSessions).toEqual([newSession]);
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
    const sessionState = createSessionState({
      requestRecentSessions: () => {
        const response = recentResponses.shift();
        if (!response) throw new Error("Missing response");
        return response;
      },
      requestSwitchSession,
    });

    const initialRecentLoad = sessionState.loadRecentSessions();
    initialRecentResponse.resolve([existingSession]);
    await initialRecentLoad;
    expect(sessionState.getSnapshot().recentSessions).toEqual([
      existingSession,
    ]);

    const staleRecentLoad = sessionState.loadRecentSessions();
    const switching = sessionState.switchSession(newSession.sessionId);
    expect(sessionState.canSwitchSession()).toBe(false);
    expect(requestSwitchSession).toHaveBeenCalledWith(newSession.sessionId);

    switchResponse.resolve(newSession);
    await expect(switching).resolves.toEqual(newSession);
    expect(sessionState.getSnapshot()).toMatchObject({
      activeSession: newSession,
      recentSessions: undefined,
      sessionSelectionVersion: 1,
      isSessionMutationPending: false,
    });

    staleRecentResponse.resolve([existingSession]);
    await staleRecentLoad;
    expect(sessionState.getSnapshot().recentSessions).toBeUndefined();

    refreshedRecentResponse.resolve([newSession, existingSession]);
    await vi.waitFor(() => {
      expect(sessionState.getSnapshot().recentSessions).toEqual([
        newSession,
        existingSession,
      ]);
    });
  });

  it("updates and promotes a titled session without changing selection", async () => {
    const refreshedRecents = deferred<SessionSummary[]>();
    const titledSession: SessionSummary = {
      ...newSession,
      title: "Research archive",
      modifiedAt: "2026-07-19T12:00:00.000Z",
    };
    const requestRecentSessions = vi
      .fn<() => Promise<SessionSummary[]>>()
      .mockResolvedValueOnce([existingSession, newSession])
      .mockImplementationOnce(() => refreshedRecents.promise);
    const requestSetSessionTitle = vi.fn(() => Promise.resolve(titledSession));
    const sessionState = createSessionState({
      requestRecentSessions,
      requestSetSessionTitle,
    });
    await sessionState.loadActiveHistory();
    await sessionState.loadRecentSessions();

    await expect(
      sessionState.setSessionTitle(newSession.sessionId, "Research archive"),
    ).resolves.toEqual(titledSession);
    expect(requestSetSessionTitle).toHaveBeenCalledWith(
      newSession.sessionId,
      "Research archive",
    );
    expect(sessionState.getSnapshot()).toMatchObject({
      activeSession: existingSession,
      recentSessions: [titledSession, existingSession],
      sessionSelectionVersion: 0,
      isSessionMutationPending: false,
    });

    refreshedRecents.resolve([titledSession, existingSession]);
    await vi.waitFor(() => {
      expect(sessionState.getSnapshot().recentSessions).toEqual([
        titledSession,
        existingSession,
      ]);
    });
  });

  it("updates the active summary after a title change without reloading history", async () => {
    const titledSession: SessionSummary = {
      ...existingSession,
      title: "Active research",
    };
    const requestActiveHistory = vi.fn(() =>
      Promise.resolve(historyResponse()),
    );
    const sessionState = createSessionState({
      requestActiveHistory,
      requestSetSessionTitle: () => Promise.resolve(titledSession),
    });
    await sessionState.loadActiveHistory();

    await sessionState.setSessionTitle(
      existingSession.sessionId,
      "Active research",
    );

    expect(sessionState.getSnapshot()).toMatchObject({
      activeSession: titledSession,
      sessionSelectionVersion: 0,
    });
    expect(requestActiveHistory).toHaveBeenCalledOnce();
  });

  it("reconciles the active first-message preview after a completed run", async () => {
    const previewedSession: SessionSummary = {
      ...newSession,
      firstUserMessage: {
        preview: "Investigate title editing",
        truncated: false,
      },
      modifiedAt: "2026-07-19T11:01:00.000Z",
    };
    const requestRecentSessions = vi.fn(() =>
      Promise.resolve([previewedSession]),
    );
    const sessionState = createSessionState({
      requestActiveHistory: () => Promise.resolve(historyResponse(newSession)),
      requestRecentSessions,
    });
    await sessionState.loadActiveHistory();

    sessionState.updateAgentActivity({ type: "agent_start" });
    sessionState.updateAgentActivity({ type: "agent_end" });

    await vi.waitFor(() => {
      expect(sessionState.getSnapshot()).toMatchObject({
        activeSession: previewedSession,
        sessionSelectionVersion: 0,
      });
    });
    expect(requestRecentSessions).toHaveBeenCalledOnce();
  });

  it("allows session changes during a run and serializes mutations", async () => {
    const switchResponse = deferred<SessionSummary>();
    const requestSwitchSession = vi.fn(() => switchResponse.promise);
    const requestSetSessionTitle = vi.fn(() =>
      Promise.resolve(existingSession),
    );
    const sessionState = createSessionState({
      requestSwitchSession,
      requestSetSessionTitle,
    });

    sessionState.updateAgentActivity({ type: "agent_start" });
    await expect(
      sessionState.setSessionTitle("session-1", "While running"),
    ).resolves.toEqual(existingSession);
    expect(requestSetSessionTitle).toHaveBeenCalledWith(
      "session-1",
      "While running",
    );

    const first = sessionState.switchSession("session-2");
    expect(requestSwitchSession).toHaveBeenCalledOnce();
    await expect(
      sessionState.switchSession("session-3"),
    ).resolves.toBeUndefined();
    await expect(
      sessionState.setSessionTitle("session-1", "Pending"),
    ).resolves.toBeUndefined();

    switchResponse.resolve(newSession);
    await first;
    expect(sessionState.getSnapshot()).toMatchObject({
      activeSession: newSession,
      isAgentRunning: false,
      canSwitchSession: true,
    });
  });

  it("returns the active row without requesting the same session", async () => {
    const requestSwitchSession = vi.fn(() => Promise.resolve(newSession));
    const sessionState = createSessionState({ requestSwitchSession });
    await sessionState.loadActiveHistory();

    await expect(
      sessionState.switchSession(existingSession.sessionId),
    ).resolves.toEqual(existingSession);
    expect(requestSwitchSession).not.toHaveBeenCalled();
    expect(sessionState.getSnapshot().sessionSelectionVersion).toBe(0);
  });

  it("keeps existing summaries when a title change fails", async () => {
    const sessionState = createSessionState({
      requestRecentSessions: () =>
        Promise.resolve([existingSession, newSession]),
      requestSetSessionTitle: () =>
        Promise.reject(new Error("title change failed")),
    });
    await sessionState.loadActiveHistory();
    await sessionState.loadRecentSessions();

    await expect(
      sessionState.setSessionTitle(existingSession.sessionId, "Broken"),
    ).rejects.toThrow("title change failed");
    expect(sessionState.getSnapshot()).toMatchObject({
      activeSession: existingSession,
      recentSessions: [existingSession, newSession],
      sessionSelectionVersion: 0,
      isSessionMutationPending: false,
    });
  });

  it("tracks selected-session activity without blocking retargeting", () => {
    const sessionState = createSessionState();
    const listener = vi.fn();
    sessionState.subscribe(listener);

    expect(sessionState.isAgentRunning()).toBe(false);
    expect(sessionState.canSwitchSession()).toBe(true);
    sessionState.updateAgentActivity({ type: "agent_start" });
    expect(sessionState.isAgentRunning()).toBe(true);
    expect(sessionState.canSwitchSession()).toBe(true);
    expect(listener).toHaveBeenCalledOnce();

    sessionState.updateAgentActivity({ type: "turn_end" });
    expect(listener).toHaveBeenCalledOnce();
    sessionState.updateAgentActivity({ type: "agent_end" });
    expect(sessionState.isAgentRunning()).toBe(false);
    expect(sessionState.canSwitchSession()).toBe(true);
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("keeps the prior active session when a mutation fails", async () => {
    const responses = [
      Promise.resolve(newSession),
      Promise.reject(new Error("transition failed")),
    ];
    const sessionState = createSessionState({
      requestNewSession: () => {
        const response = responses.shift();
        if (!response) throw new Error("Missing response");
        return response;
      },
    });
    await sessionState.newSession();

    await expect(sessionState.newSession()).rejects.toThrow(
      "transition failed",
    );
    expect(sessionState.getSnapshot()).toMatchObject({
      activeSession: newSession,
      sessionSelectionVersion: 1,
      isSessionMutationPending: false,
    });
  });
});
