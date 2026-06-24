import { createContext, useContext, type ReactNode } from "react";

import type { WorkspaceClient } from "./client";

const WorkspaceClientContext = createContext<WorkspaceClient | undefined>(
  undefined,
);

export interface WorkspaceClientProviderProps {
  client: WorkspaceClient;
  children: ReactNode;
}

export function WorkspaceClientProvider({
  client,
  children,
}: WorkspaceClientProviderProps) {
  return (
    <WorkspaceClientContext.Provider value={client}>
      {children}
    </WorkspaceClientContext.Provider>
  );
}

export function useWorkspaceClient(): WorkspaceClient {
  const client = useContext(WorkspaceClientContext);
  if (!client) {
    throw new Error("WorkspaceClientProvider is missing");
  }
  return client;
}
