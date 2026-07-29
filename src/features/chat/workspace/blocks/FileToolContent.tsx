import { DefaultToolContent } from "./DefaultToolContent";
import { toToolTextContent } from "./tool";
import type { ToolItem } from "./tool";

export function FileToolContent({ item }: { item: ToolItem }) {
  const args = asRecord(item.args);
  const reason = toNonEmptyString(args?.["reason"]);
  const path = item.file?.displayPath ?? toNonEmptyString(args?.["path"]);
  if (!reason || !path) return <DefaultToolContent item={item} />;
  const disclosure =
    item.toolName === "write"
      ? toString(args?.["content"])
      : item.complete
        ? toToolTextContent(item)
        : undefined;

  return (
    <div className="tool-block file-tool-block" data-uix-part="file-tool">
      <div className="file-tool-block__summary">
        <code data-uix-part="file-path">{path}</code>
        <span aria-hidden="true"> — </span>
        <span data-uix-part="tool-reason">{reason}</span>
      </div>
      {disclosure !== undefined ? (
        <details
          className="tool-block__details"
          data-uix-part="file-disclosure"
        >
          <summary>{item.toolName === "write" ? "content" : "result"}</summary>
          <pre>{disclosure}</pre>
        </details>
      ) : null}
    </div>
  );
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function toNonEmptyString(value: unknown): string | undefined {
  const normalized = toString(value)?.trim();
  return normalized || undefined;
}

function toString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}
