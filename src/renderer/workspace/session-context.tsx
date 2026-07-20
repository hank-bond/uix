import {
  createContext,
  useContext,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from "react";

import { agentChannels } from "@uix/api/agent-channels";
import {
  ActiveSessionProvider,
  createChannelClient,
  useWorkspaceClient,
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
      new WorkspaceSessionController(() =>
        agent.requests.new_session(undefined),
      ),
    [agent],
  );
  const activeSession = useSyncExternalStore(
    controller.subscribe,
    controller.getActiveSessionSnapshot,
    controller.getActiveSessionSnapshot,
  );

  return (
    <WorkspaceSessionControllerContext.Provider value={controller}>
      <ActiveSessionProvider activeSession={activeSession}>
        {children}
      </ActiveSessionProvider>
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
