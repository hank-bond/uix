// pi session/events → transcript model.
//
// The renderer consumes one UIX-owned transcript item shape whether the source
// is a persisted pi session entry or a live pi event. Live streaming may attach
// volatile fields such as `partialResult`; persisted history only replays the
// durable completed items.

import type { SessionEntry } from "@earendil-works/pi-coding-agent";

import type { TranscriptItem } from "@uix/api/agent-channels";

// The single definition of a tool row's durable id. Live rows
// (transcript-item-identity.ts) and history replay (below) must derive
// byte-identical ids; otherwise state keyed against one would miss the other.
export function toolItemId(entryId: string, toolCallId: string): string {
  return `${entryId}:tool:${toolCallId}`;
}

export function toTranscriptItems(
  entries: readonly SessionEntry[],
): TranscriptItem[] {
  const items: TranscriptItem[] = [];
  const toolIndexes = new Map<string, number>();

  for (const entry of entries) {
    if (entry.type === "custom_message") {
      items.push({
        id: entry.id,
        kind: "custom",
        customType: entry.customType,
        content: toIpcValue(entry.content),
        details: toIpcValue(entry.details),
        display: entry.display,
      });
      continue;
    }

    if (entry.type !== "message") continue;

    const role = getMessageRole(entry.message);

    if (role === "user") {
      const text = extractTranscriptText(entry.message);
      if (text) items.push({ id: entry.id, kind: "user", text });
      continue;
    }

    if (role === "assistant") {
      const text = extractTranscriptText(entry.message);
      if (text) {
        items.push({
          id: entry.id,
          kind: "assistant",
          text,
          complete: true,
        });
      }

      for (const toolCall of extractToolCalls(
        asRecord(entry.message)?.["content"],
      )) {
        const item: TranscriptItem = {
          id: toolItemId(entry.id, toolCall.id),
          kind: "tool",
          toolCallId: toolCall.id,
          toolName: toolCall.name,
          args: toIpcValue(toolCall.arguments),
          complete: true,
        };
        toolIndexes.set(toolCall.id, items.length);
        items.push(item);
      }
      continue;
    }

    if (role === "toolResult") {
      const tool = parseToolResult(entry.message);
      if (!tool) continue;
      const result = {
        content: toIpcValue(tool.content),
        details: toIpcValue(tool.details),
      };
      const index = toolIndexes.get(tool.toolCallId);
      if (index === undefined) {
        items.push({
          id: entry.id,
          kind: "tool",
          toolCallId: tool.toolCallId,
          toolName: tool.toolName,
          result,
          isError: tool.isError,
          complete: true,
        });
      } else {
        const existing = items[index];
        if (existing.kind === "tool") {
          items[index] = {
            ...existing,
            toolName: tool.toolName,
            result,
            isError: tool.isError,
            complete: true,
          };
        }
      }
    }
  }

  return items;
}

export function extractTranscriptText(message: unknown): string {
  return extractTextContent(asRecord(message)?.["content"]).trim();
}

export function getMessageRole(message: unknown): string {
  const role = asRecord(message)?.["role"];
  return typeof role === "string" ? role : "custom";
}

export function parseCustomTranscriptItem(
  id: string,
  message: unknown,
): Extract<TranscriptItem, { kind: "custom" }> | undefined {
  const obj = asRecord(message);
  if (!obj || obj["role"] !== "custom") return undefined;
  const customType = obj["customType"];
  if (typeof customType !== "string") return undefined;
  return {
    id,
    kind: "custom",
    customType,
    content: toIpcValue(obj["content"]),
    details: toIpcValue(obj["details"]),
    display: obj["display"] === true,
  };
}

interface ToolCallBlock {
  id: string;
  name: string;
  arguments: unknown;
}

export function extractToolCalls(content: unknown): ToolCallBlock[] {
  if (!Array.isArray(content)) return [];
  const calls: ToolCallBlock[] = [];
  for (const block of content) {
    const obj = asRecord(block);
    if (!obj || obj["type"] !== "toolCall") continue;
    const id = obj["id"];
    const name = obj["name"];
    if (typeof id !== "string" || typeof name !== "string") continue;
    calls.push({ id, name, arguments: obj["arguments"] });
  }
  return calls;
}

function parseToolResult(message: unknown) {
  const obj = asRecord(message);
  if (!obj || obj["role"] !== "toolResult") return undefined;
  const toolCallId = obj["toolCallId"];
  const toolName = obj["toolName"];
  if (typeof toolCallId !== "string" || typeof toolName !== "string") {
    return undefined;
  }
  return {
    toolCallId,
    toolName,
    content: obj["content"],
    details: obj["details"],
    isError: obj["isError"] === true,
  };
}

// Content is a string or a block array whose text blocks carry `{ type: "text",
// text }`. Read defensively over the block shape so new pi block kinds (tool
// calls, images, thinking) are skipped rather than breaking transcript replay.
function extractTextContent(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .filter(
      (block): block is { type: "text"; text: string } =>
        typeof block === "object" &&
        block !== null &&
        (block as { type?: unknown }).type === "text" &&
        typeof (block as { text?: unknown }).text === "string",
    )
    .map((block) => block.text)
    .join("");
}

export function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : undefined;
}

export function toIpcValue(value: unknown): unknown {
  try {
    const json = JSON.stringify(value);
    return json === undefined ? undefined : JSON.parse(json);
  } catch {
    return String(value);
  }
}
