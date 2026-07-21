import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from "react";

import { agentChannels } from "@uix/api/agent-channels";
import {
  createChannelClient,
  useWorkspaceClient,
  WorkspaceSessionProvider,
} from "@uix/api/workspace";

import { WorkspaceSessionController } from "./session-controller";

const WorkspaceSessionControllerContext = createContext<
  WorkspaceSessionController | undefined
>(undefined);

export function WorkspaceSessionControllerProvider({
  children,
}: {
  children: ReactNode;
}) {
  const workspace = useWorkspaceClient();
  const agent = useMemo(
    () => createChannelClient(workspace, agentChannels),
    [workspace],
  );
  const controller = useMemo(
    () =>
      new WorkspaceSessionController({
        requestActiveHistory: () => agent.requests.session_history({}),
        requestNewSession: () => agent.requests.new_session(undefined),
      }),
    [agent],
  );
  const activeSession = useSyncExternalStore(
    controller.subscribe,
    controller.getActiveSessionSnapshot,
    controller.getActiveSessionSnapshot,
  );

  useEffect(
    () => agent.events.event((event) => controller.updateAgentActivity(event)),
    [agent, controller],
  );

  const loadActiveHistory = useCallback(
    () => controller.loadActiveHistory(),
    [controller],
  );
  const sessionSelectionVersion = controller.getSessionSelectionVersion();
  const session = useMemo(
    () => ({ activeSession, sessionSelectionVersion, loadActiveHistory }),
    [activeSession, sessionSelectionVersion, loadActiveHistory],
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
