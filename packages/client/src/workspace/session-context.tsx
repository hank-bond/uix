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

import { WorkspaceSessionController } from "./session-controller";
import type { SessionLocationAdapter } from "./session-location";

const RecentSessionLimit = 10;

const WorkspaceSessionControllerContext = createContext<
  WorkspaceSessionController | undefined
>(undefined);

export function WorkspaceSessionControllerProvider({
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
  const controller = useMemo(
    () =>
      new WorkspaceSessionController({
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
    controller.subscribe,
    controller.getSnapshot,
    controller.getSnapshot,
  );

  useEffect(
    () =>
      agent.events.event((event) => {
        controller.updateAgentActivity(event);
      }),
    [agent, controller],
  );
  useEffect(() => {
    void controller.loadRecentSessions().catch(() => {});
  }, [controller]);
  useEffect(() => {
    if (!sessionLocationAdapter) return;
    return sessionLocationAdapter.subscribe(async (sessionId) => {
      const selected = await controller.switchSession(sessionId);
      if (selected?.sessionId !== sessionId) {
        throw new Error(`Unable to navigate to session: ${sessionId}`);
      }
    });
  }, [controller, sessionLocationAdapter]);

  const loadActiveHistory = useCallback(
    () => controller.loadActiveHistory(),
    [controller],
  );
  const switchSession = useCallback(
    (sessionId: string) => controller.switchSession(sessionId),
    [controller],
  );
  const setSessionTitle = useCallback(
    (sessionId: string, title: string | null) =>
      controller.setSessionTitle(sessionId, title),
    [controller],
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
    <WorkspaceSessionControllerContext.Provider value={controller}>
      <WorkspaceSessionProvider session={session}>
        {children}
      </WorkspaceSessionProvider>
    </WorkspaceSessionControllerContext.Provider>
  );
}

export function useWorkspaceSessionController(): WorkspaceSessionController {
  const controller = useContext(WorkspaceSessionControllerContext);
  if (!controller) {
    throw new Error("WorkspaceSessionControllerProvider is missing");
  }
  return controller;
}
