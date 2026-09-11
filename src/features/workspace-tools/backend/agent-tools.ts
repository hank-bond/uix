// Reason-bearing workspace tools over Pi's baseline implementations.
//
// The definitions preserve Pi's execution semantics while adding a concise
// human-facing reason to each call. The reason is presentation data: it is
// removed before execution delegates to Pi's cwd-bound implementation.

import {
  createBashToolDefinition,
  createEditToolDefinition,
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

const BaselineEdit = createEditToolDefinition(".");
const EditParams = Type.Object({
  ...BaselineEdit.parameters.properties,
  reason: ReasonSchema,
});

const BaselineShell = createBashToolDefinition(".");
const ShellParams = Type.Object({
  ...BaselineShell.parameters.properties,
  reason: ReasonSchema,
});

export function createWorkspaceToolOverrideContributions(): readonly AgentToolOverrideContribution[] {
  return [
    { name: "read", tool: createReadOverride() },
    { name: "write", tool: createWriteOverride() },
    { name: "edit", tool: createEditOverride() },
    { name: "shell", tool: createShellTool() },
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

function createEditOverride(): AgentToolDefinition<typeof EditParams> {
  return {
    label: BaselineEdit.label,
    description: `${BaselineEdit.description} Include a concise reason so the user can understand why the file is being edited.`,
    promptSnippet: BaselineEdit.promptSnippet,
    promptGuidelines: BaselineEdit.promptGuidelines,
    parameters: EditParams,
    // Pi preserves extra fields, including reason. Validation against EditParams
    // still runs after preparation, so a missing reason remains invalid.
    prepareArguments: BaselineEdit.prepareArguments as AgentToolDefinition<
      typeof EditParams
    >["prepareArguments"],
    execute(toolCallId, { reason: _reason, ...params }, signal, onUpdate, ctx) {
      return createEditToolDefinition(ctx.cwd).execute(
        toolCallId,
        params,
        signal,
        onUpdate,
        ctx,
      );
    },
  };
}

function createShellTool(): AgentToolDefinition<typeof ShellParams> {
  return {
    label: "shell",
    description:
      "Execute a command in the current working directory and return its output. Output is truncated to the last 2000 lines or 50KB, whichever is reached first. Optionally provide a timeout in seconds. Include a concise reason so the human can understand why the command is useful.",
    promptSnippet: "Execute commands (ls, grep, find, etc.)",
    promptGuidelines: BaselineShell.promptGuidelines,
    parameters: ShellParams,
    execute(toolCallId, { reason: _reason, ...params }, signal, onUpdate, ctx) {
      return createBashToolDefinition(ctx.cwd).execute(
        toolCallId,
        params,
        signal,
        onUpdate,
        ctx,
      );
    },
  };
}
