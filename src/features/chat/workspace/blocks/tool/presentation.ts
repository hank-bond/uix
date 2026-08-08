// Derives tool block state, display names, and payload text for chat tool rendering.

import type { TranscriptItem } from "@uix/api/agent-channels";

import { extractTextContent, truncateText } from "../content/text";

export type ToolItem = Extract<TranscriptItem, { kind: "tool" }>;
export type ToolState = "running" | "success" | "error";

export interface ToolParam {
  key: string;
  value: string;
}

/** Generic collapsed summary for every tool call. */
export interface ToolCallSummary {
  label: string;
  description?: string;
  /** Every surfaceable arg in call order (the settings list source). */
  surfaceableParams: ToolParam[];
  /** Args surfaced in the collapsed summary. */
  collapsedParams: ToolParam[];
  /** Args shifted to the expanded view as `key: value` rows. */
  expandedParams: ToolParam[];
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
  // Collapse separator runs so `featureId__name` renders with single spaces.
  return toolName.replace(/^uix_/, "").replace(/_+/g, " ");
}

const DescriptionArgKeys = new Set(["reason", "description"]);

/** The human-facing reason a call provides, when it provides one. */
export function toToolDescription(args: unknown): string | undefined {
  const record = asRecord(args);
  if (!record) return undefined;
  return (
    toNonEmptyString(record["reason"]) ??
    toNonEmptyString(record["description"])
  );
}

/**
 * Flatten a call's args into display params, excluding the description field
 * and any args consumed as expanded content by the tool's content policy.
 */
export function toToolParams(
  args: unknown,
  contentArgKeys: readonly string[] = [],
): ToolParam[] {
  const record = asRecord(args);
  if (!record) return [];
  const contentArgs = new Set(contentArgKeys);
  const params: ToolParam[] = [];
  for (const [key, value] of Object.entries(record)) {
    if (DescriptionArgKeys.has(key) || contentArgs.has(key)) continue;
    const text = toParamText(value);
    if (text) params.push({ key, value: text });
  }
  return params;
}

function toParamText(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed || undefined;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  try {
    return JSON.stringify(value);
  } catch {
    return undefined;
  }
}
