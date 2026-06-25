import type {
  AgentEvent,
  PromptRequest,
  TranscriptSnapshot,
} from "#shared/ipc";
import type { WorkspaceClient } from "@uix/api/workspace";

export const AgentRequests = {
  prompt: "agent.prompt",
  history: "agent.history",
} as const;

export const AgentEvents = {
  event: "agent.event",
} as const;

export interface AgentClient {
  sendPrompt(req: PromptRequest): Promise<void>;
  getHistory(): Promise<TranscriptSnapshot>;
  onEvent(handler: (event: AgentEvent) => void): () => void;
}

export function createAgentClient(workspace: WorkspaceClient): AgentClient {
  return {
    sendPrompt(req: PromptRequest) {
      return workspace.request<PromptRequest, void>(AgentRequests.prompt, req);
    },
    getHistory() {
      return workspace.request<void, TranscriptSnapshot>(
        AgentRequests.history,
        undefined,
      );
    },
    onEvent(handler: (event: AgentEvent) => void) {
      return workspace.subscribe(AgentEvents.event, handler);
    },
  };
}
