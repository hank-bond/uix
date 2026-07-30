import { createEditToolDefinition } from "@earendil-works/pi-coding-agent";

import type {
  AgentToolDefinition,
  AgentToolOverrideContribution,
} from "@uix/api/agent-tools";

const baseline = createEditToolDefinition(".");

const tool: AgentToolDefinition<typeof baseline.parameters> = {
  label: baseline.label,
  description: baseline.description,
  promptSnippet: baseline.promptSnippet,
  promptGuidelines: baseline.promptGuidelines,
  parameters: baseline.parameters,
  execute(toolCallId, params, signal, onUpdate, ctx) {
    return createEditToolDefinition(ctx.cwd).execute(
      toolCallId,
      params,
      signal,
      onUpdate,
      ctx,
    );
  },
};

export const editTool: AgentToolOverrideContribution = { name: "edit", tool };
