// Renders file tool content and results with syntax highlighting and soft wrapping for prose files.

import type { JSX } from "react";

import { CodeBlock } from "../../content/CodeBlock";
import {
  HighlightedCode,
  inferCodeLanguageFromPath,
} from "../../content/HighlightedCode";
import type { ToolItem } from "../call-presentation";
import {
  asRecord,
  toNonEmptyString,
  toString,
  toToolTextContent,
} from "../call-presentation";

export function FileToolContent({ item }: { item: ToolItem }): JSX.Element {
  const args = asRecord(item.args);
  const path = item.file?.displayPath ?? toNonEmptyString(args?.["path"]);
  const disclosure =
    item.toolName === "write"
      ? toString(args?.["content"])
      : item.complete
        ? toToolTextContent(item)
        : undefined;
  const sourcePath = item.file?.absolutePath ?? path ?? "";
  const language = inferCodeLanguageFromPath(sourcePath);
  const softWrap = /\.(?:md|markdown|mdx|txt|text|rst|adoc)$/i.test(sourcePath);

  return (
    <div className="file-tool-block__details">
      {disclosure !== undefined ? (
        <>
          <span className="tool-call__section-label">
            {item.toolName === "write" ? "content" : "result"}
          </span>
          {disclosure === "" ? (
            <span className="tool-call__empty">
              {item.toolName === "write" ? "Empty content" : "No output"}
            </span>
          ) : (
            <CodeBlock
              className={softWrap ? "file-tool-block__prose" : undefined}
            >
              <HighlightedCode text={disclosure} language={language} />
            </CodeBlock>
          )}
        </>
      ) : undefined}
    </div>
  );
}
