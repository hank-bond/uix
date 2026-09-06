// Provides the workspace session handle and agent activity feed to the workspace tree.

import type { JSX } from "react";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useSyncExternalStore,
} from "react";

import { agentChannels, createClientMutationId } from "@uix/api/agent-channels";
import {
  createChannelClient,
  useWorkspaceClient,
  WorkspaceSessionProvider,
} from "@uix/api/workspace";

import type { SessionLocationAdapter } from "./session-location";
import { WorkspaceSessionState } from "./session-state";

const RecentSessionLimit = 10;

const WorkspaceSessionStateContext = createContext<
  WorkspaceSessionState | undefined
>(undefined);

export function WorkspaceSessionStateProvider({
  children,
  sessionLocationAdapter,
}: {
  children: ReactNode;
  sessionLocationAdapter?: SessionLocationAdapter;
}): JSX.Element {
  const workspace = useWorkspaceClient();
  const agent = useMemo(
    () => createChannelClient(workspace, "agent", agentChannels),
    [workspace],
  );
  const sessionState = useMemo(
    () =>
      new WorkspaceSessionState({
        requestActiveHistory: () => agent.requests.session_history({}),
        requestRecentSessions: () =>
          agent.requests.list_session_summaries({ limit: RecentSessionLimit }),
        requestNewSession: () =>
          agent.requests.new_session({ mutationId: createClientMutationId() }),
        requestSwitchSession: (sessionId) =>
          agent.requests.switch_session({ sessionId }),
        requestSetSessionTitle: (sessionId, title) =>
          agent.requests.set_session_title({ sessionId, title }),
        synchronizeSessionLocation: sessionLocationAdapter?.synchronize,
      }),
    [agent, sessionLocationAdapter],
  );
  const snapshot = useSyncExternalStore(
    sessionState.subscribe,
    sessionState.getSnapshot,
    sessionState.getSnapshot,
  );

  useEffect(
    () =>
      agent.events.event((event) => {
        sessionState.updateAgentActivity(event);
      }),
    [agent, sessionState],
  );
  useEffect(() => {
    void sessionState.loadRecentSessions().catch(() => {});
  }, [sessionState]);
  useEffect(() => {
    if (!sessionLocationAdapter) return;
    return sessionLocationAdapter.subscribe(async (sessionId) => {
      const selected = await sessionState.switchSession(sessionId);
      if (selected?.sessionId !== sessionId) {
        throw new Error(`Unable to navigate to session: ${sessionId}`);
      }
    });
  }, [sessionState, sessionLocationAdapter]);

  const loadActiveHistory = useCallback(
    () => sessionState.loadActiveHistory(),
    [sessionState],
  );
  const switchSession = useCallback(
    (sessionId: string) => sessionState.switchSession(sessionId),
    [sessionState],
  );
  const setSessionTitle = useCallback(
    (sessionId: string, title: string | null) =>
      sessionState.setSessionTitle(sessionId, title),
    [sessionState],
  );
  const session = useMemo(
    () => ({
      activeSession: snapshot.activeSession,
      recentSessions: snapshot.recentSessions,
      sessionSelectionVersion: snapshot.sessionSelectionVersion,
      canSwitchSession: snapshot.canSwitchSession,
      loadActiveHistory,
      switchSession,
      setSessionTitle,
    }),
    [snapshot, loadActiveHistory, switchSession, setSessionTitle],
  );

  return (
    <WorkspaceSessionStateContext.Provider value={sessionState}>
      <WorkspaceSessionProvider session={session}>
        {children}
      </WorkspaceSessionProvider>
    </WorkspaceSessionStateContext.Provider>
  );
}

export function useWorkspaceSessionState(): WorkspaceSessionState {
  const sessionState = useContext(WorkspaceSessionStateContext);
  if (!sessionState) {
    throw new Error("WorkspaceSessionStateProvider is missing");
  }
  return sessionState;
}
