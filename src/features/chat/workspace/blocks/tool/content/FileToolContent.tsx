// Renders file tool expanded content: written content or read result disclosure.

import type { JSX } from "react";

import { CodeBlock } from "../../content/CodeBlock";
import {
  HighlightedCode,
  inferCodeLanguageFromPath,
} from "../../content/HighlightedCode";
import type { ToolItem } from "../presentation";
import {
  asRecord,
  toNonEmptyString,
  toString,
  toToolTextContent,
} from "../presentation";

export function FileToolContent({ item }: { item: ToolItem }): JSX.Element {
  const args = asRecord(item.args);
  const path = item.file?.displayPath ?? toNonEmptyString(args?.["path"]);
  const disclosure =
    item.toolName === "write"
      ? toString(args?.["content"])
      : item.complete
        ? toToolTextContent(item)
        : undefined;
  const language = inferCodeLanguageFromPath(
    item.file?.absolutePath ?? path ?? "",
  );

  return (
    <div className="file-tool-block__details">
      {disclosure !== undefined ? (
        <>
          <span className="tool-call__section-label">
            {item.toolName === "write" ? "content" : "result"}
          </span>
          <CodeBlock>
            <HighlightedCode text={disclosure} language={language} />
          </CodeBlock>
        </>
      ) : undefined}
    </div>
  );
}
