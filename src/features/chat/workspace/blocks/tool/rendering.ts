import type { ReactNode } from "react";

import type { TranscriptItem } from "@uix/api/agent-channels";
import { extractTextContent, truncateText } from "../content/text";

export type ToolItem = Extract<TranscriptItem, { kind: "tool" }>;
export type ToolState = "running" | "success" | "error";

export interface ToolChatRenderer {
  displayName: string;
  renderLabel?: (props: {
    item: ToolItem;
    state: ToolState;
  }) => ReactNode | undefined;
  render: (props: { item: ToolItem; state: ToolState }) => ReactNode;
}

export function toToolState(item: ToolItem): ToolState {
  if (!item.complete) return "running";
  return item.isError ? "error" : "success";
}

export function toToolPayloadText(item: ToolItem): string | undefined {
  return truncateText(toToolTextContent(item));
}

export function toToolTextContent(item: ToolItem): string | undefined {
  const value = extractTextContent(
    !item.complete ? (item.partialResult ?? item.args) : item.result,
  );
  if (value === undefined || value === null) return undefined;
  return typeof value === "string"
    ? value
    : JSON.stringify(value, undefined, 2);
}

export function toToolDisplayName(toolName: string): string {
  return toolName.replace(/^uix_/, "").replaceAll("_", " ");
}
