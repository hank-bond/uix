// Provides the workspace read tool, rebinding Pi's baseline to the workspace cwd.

import { createReadToolDefinition } from "@earendil-works/pi-coding-agent";

import type {
  AgentToolContribution,
  AgentToolDefinition,
} from "@uix/api/agent-tools";

const baseline = createReadToolDefinition(".");

const tool: AgentToolDefinition<typeof baseline.parameters> = {
  label: baseline.label,
  description: baseline.description,
  promptSnippet: baseline.promptSnippet,
  promptGuidelines: baseline.promptGuidelines,
  parameters: baseline.parameters,
  execute(toolCallId, params, signal, onUpdate, ctx) {
    return createReadToolDefinition(ctx.cwd).execute(
      toolCallId,
      params,
      signal,
      onUpdate,
      ctx,
    );
  },
};

export const readTool: AgentToolContribution = { name: "read", tool };
