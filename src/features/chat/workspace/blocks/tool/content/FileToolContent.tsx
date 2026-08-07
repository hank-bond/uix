// Renders file tool reads and writes: path summary with content or result disclosure.

import type { JSX } from "react";

import { DefaultToolContent } from "./DefaultToolContent";
import { ToolCallDisclosure } from "./ToolCallDisclosure";
import { CodeBlock } from "../../content/CodeBlock";
import {
  HighlightedCode,
  inferCodeLanguageFromPath,
} from "../../content/HighlightedCode";
import type { ToolItem, ToolState } from "../presentation";
import { toToolTextContent } from "../presentation";

interface FileToolPresentation {
  path: string;
  reason: string;
}

export function FileToolContent({
  item,
  state,
}: {
  item: ToolItem;
  state: ToolState;
}): JSX.Element {
  const presentation = tryParseFileToolPresentation(item);
  if (!presentation) return <DefaultToolContent item={item} />;
  const args = asRecord(item.args);
  const disclosure =
    item.toolName === "write"
      ? toString(args?.["content"])
      : item.complete
        ? toToolTextContent(item)
        : undefined;
  const language = inferCodeLanguageFromPath(
    item.file?.absolutePath ?? presentation.path,
  );

  return (
    <div className="tool-block file-tool-block">
      <ToolCallDisclosure
        toolName={item.toolName}
        description={presentation.reason}
        target={presentation.path}
        state={state}
        part="file-tool"
      >
        {disclosure !== undefined ? (
          <div className="file-tool-block__details">
            <span className="tool-call__section-label">
              {item.toolName === "write" ? "content" : "result"}
            </span>
            <CodeBlock>
              <HighlightedCode text={disclosure} language={language} />
            </CodeBlock>
          </div>
        ) : undefined}
      </ToolCallDisclosure>
    </div>
  );
}

export function tryParseFileToolPresentation(
  item: ToolItem,
): FileToolPresentation | undefined {
  const args = asRecord(item.args);
  const reason = toNonEmptyString(args?.["reason"]);
  const path = item.file?.displayPath ?? toNonEmptyString(args?.["path"]);
  return reason && path ? { path, reason } : undefined;
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
