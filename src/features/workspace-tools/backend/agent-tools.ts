// Reason-bearing replacements for Pi's baseline filesystem tools.
//
// The definitions preserve Pi's read/write execution semantics while adding a
// concise human-facing reason to each call. The reason is presentation data:
// it is removed before execution delegates to Pi's cwd-bound implementation.

import {
  createReadToolDefinition,
  createWriteToolDefinition,
} from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

import type {
  AgentToolDefinition,
  AgentToolOverrideContribution,
} from "@uix/api/agent-tools";

const ReasonSchema = Type.String({
  description:
    "One concise sentence in layman's terms explaining why this operation is useful for the current task. This enables less-technical users to follow your thought process and understand why certain actions are being made.",
});

const BaselineRead = createReadToolDefinition(".");
const ReadParams = Type.Object({
  ...BaselineRead.parameters.properties,
  reason: ReasonSchema,
});

const BaselineWrite = createWriteToolDefinition(".");
const WriteParams = Type.Object({
  ...BaselineWrite.parameters.properties,
  reason: ReasonSchema,
});

export function createFileToolOverrideContributions(): readonly AgentToolOverrideContribution[] {
  return [
    { name: "read", tool: createReadOverride() },
    { name: "write", tool: createWriteOverride() },
  ];
}

function createReadOverride(): AgentToolDefinition<typeof ReadParams> {
  return {
    label: BaselineRead.label,
    description: `${BaselineRead.description} Include a concise reason so the human can understand why the file is being read.`,
    promptSnippet: BaselineRead.promptSnippet,
    promptGuidelines: BaselineRead.promptGuidelines,
    parameters: ReadParams,
    execute(toolCallId, { reason: _reason, ...params }, signal, onUpdate, ctx) {
      return createReadToolDefinition(ctx.cwd).execute(
        toolCallId,
        params,
        signal,
        onUpdate,
        ctx,
      );
    },
  };
}

function createWriteOverride(): AgentToolDefinition<typeof WriteParams> {
  return {
    label: BaselineWrite.label,
    description: `${BaselineWrite.description} Include a concise reason so the human can understand why the file is being written.`,
    promptSnippet: BaselineWrite.promptSnippet,
    promptGuidelines: BaselineWrite.promptGuidelines,
    parameters: WriteParams,
    execute(toolCallId, { reason: _reason, ...params }, signal, onUpdate, ctx) {
      return createWriteToolDefinition(ctx.cwd).execute(
        toolCallId,
        params,
        signal,
        onUpdate,
        ctx,
      );
    },
  };
}
