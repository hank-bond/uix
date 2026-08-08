// Provides the workspace tool label catalog to transcript renderers.
//
// Tools are configured at the workspace level, so labels are static per tool
// name and identical across sessions. The catalog fetch is fire-and-forget:
// missing labels fall back to a prettified name.

import {
  createContext,
  type JSX,
  type ReactNode,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

import type { ToolCatalog } from "@uix/api/agent-channels";
import type { agentChannels } from "@uix/api/agent-channels";
import type { ChannelClient } from "@uix/api/workspace";

import { toToolDisplayName } from "./presentation";

type AgentChannelClient = ChannelClient<typeof agentChannels>;

const EmptyCatalog: ToolCatalog = [];

const ToolCatalogContext = createContext<ReadonlyMap<string, string>>(
  new Map(),
);

/** Label lookup without the fetch: the seam tests (and static callers) use. */
export function ToolLabelProvider({
  labelByToolName,
  children,
}: {
  labelByToolName: ReadonlyMap<string, string>;
  children: ReactNode;
}): JSX.Element {
  return (
    <ToolCatalogContext.Provider value={labelByToolName}>
      {children}
    </ToolCatalogContext.Provider>
  );
}

export function ToolCatalogProvider({
  client,
  children,
}: {
  client: AgentChannelClient;
  children: ReactNode;
}): JSX.Element {
  const [catalog, setCatalog] = useState<ToolCatalog>(EmptyCatalog);

  useEffect(() => {
    let cancelled = false;
    void client.requests
      .tool_catalog(undefined)
      .then(({ tools }) => {
        if (!cancelled) setCatalog(tools);
      })
      .catch(() => {
        // No session yet: fall back to prettified names until a reload.
      });
    return () => {
      cancelled = true;
    };
  }, [client]);

  const labelByToolName = useMemo(
    () => new Map(catalog.map((entry) => [entry.name, entry.label])),
    [catalog],
  );

  return (
    <ToolLabelProvider labelByToolName={labelByToolName}>
      {children}
    </ToolLabelProvider>
  );
}

export function useToolLabel(toolName: string): string {
  const labelByToolName = useContext(ToolCatalogContext);
  return labelByToolName.get(toolName) ?? toToolDisplayName(toolName);
}
