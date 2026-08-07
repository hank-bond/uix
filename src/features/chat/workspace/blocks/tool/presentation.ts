// Derives tool block state, display names, and payload text for chat tool rendering.

import type { ReactNode } from "react";

import type { TranscriptItem } from "@uix/api/agent-channels";

import { extractTextContent, truncateText } from "../content/text";

export type ToolItem = Extract<TranscriptItem, { kind: "tool" }>;
export type ToolState = "running" | "success" | "error";

export interface ToolChatBlockPresentation {
  label?: ReactNode;
  content: ReactNode;
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

/** Refine a value to a plain record, or undefined when it is not one. */
export function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

/** Refine a value to a string, or undefined when it is not one. */
export function toString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

/** Refine a value to a non-empty trimmed string, or undefined. */
export function toNonEmptyString(value: unknown): string | undefined {
  const normalized = toString(value)?.trim();
  return normalized || undefined;
}

export function toToolDisplayName(toolName: string): string {
  return toolName.replace(/^uix_/, "").replaceAll("_", " ");
}
