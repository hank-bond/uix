// Provides the workspace bash tool, rebinding Pi's baseline to the workspace cwd.

import { createBashToolDefinition } from "@earendil-works/pi-coding-agent";

import type {
  AgentToolContribution,
  AgentToolDefinition,
} from "@uix/api/agent-tools";

const baseline = createBashToolDefinition(".");

const tool: AgentToolDefinition<typeof baseline.parameters> = {
  label: baseline.label,
  description: baseline.description,
  promptSnippet: baseline.promptSnippet,
  promptGuidelines: baseline.promptGuidelines,
  parameters: baseline.parameters,
  execute(toolCallId, params, signal, onUpdate, ctx) {
    return createBashToolDefinition(ctx.cwd).execute(
      toolCallId,
      params,
      signal,
      onUpdate,
      ctx,
    );
  },
};

export const bashTool: AgentToolContribution = { name: "bash", tool };
