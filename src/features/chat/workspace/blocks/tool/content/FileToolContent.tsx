// Renders file tool reads and writes: path summary with content or result disclosure.

import type { JSX } from "react";

import { DefaultToolContent } from "./DefaultToolContent";
import { CodeBlock } from "../../content/CodeBlock";
import {
  HighlightedCode,
  inferCodeLanguageFromPath,
} from "../../content/HighlightedCode";
import type { ToolItem } from "../presentation";
import { toToolTextContent } from "../presentation";

export function FileToolContent({ item }: { item: ToolItem }): JSX.Element {
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
  const language = inferCodeLanguageFromPath(item.file?.absolutePath ?? path);

  return (
    <div className="tool-block file-tool-block" data-uix-part="file-tool">
      <div className="file-tool-block__summary">
        <code data-uix-part="file-path">{path}</code>
        <span data-uix-part="tool-reason">{reason}</span>
      </div>
      {disclosure !== undefined ? (
        <details
          className="tool-block__details"
          data-uix-part="file-disclosure"
        >
          <summary>{item.toolName === "write" ? "content" : "result"}</summary>
          <CodeBlock>
            <HighlightedCode text={disclosure} language={language} />
          </CodeBlock>
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
