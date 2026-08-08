// Renders command tool expanded content: highlighted command and result disclosure.

import type { JSX } from "react";

import { StructuredCommand } from "./StructuredCommand";
import { useBlockPresentationSettings } from "../../BlockPresentationSettings";
import { CodeBlock } from "../../content/CodeBlock";
import { HighlightedCode } from "../../content/HighlightedCode";
import type { ToolItem } from "../presentation";
import { asRecord, toString, toToolTextContent } from "../presentation";

export function CommandToolContent({ item }: { item: ToolItem }): JSX.Element {
  const { settings } = useBlockPresentationSettings();
  const args = asRecord(item.args);
  const command = toString(args?.["command"]);
  const output = toCommandOutput(item);

  return (
    <div className="command-tool-block__details">
      {command ? (
        <CodeBlock className="command-tool-block__command">
          <StructuredCommand
            command={command}
            layout={settings.command.layout}
          />
        </CodeBlock>
      ) : null}
      {output !== undefined ? (
        <>
          <span className="tool-call__section-label">output</span>
          <CodeBlock>
            <HighlightedCode text={output} />
          </CodeBlock>
        </>
      ) : null}
    </div>
  );
}

function toCommandOutput(item: ToolItem): string | undefined {
  const value = item.complete ? item.result : item.partialResult;
  const content = asRecord(value)?.["content"];
  if (Array.isArray(content)) {
    const text = content
      .flatMap((entry) => {
        const block = asRecord(entry);
        return block?.["type"] === "text" && typeof block["text"] === "string"
          ? [block["text"]]
          : [];
      })
      .join("");
    return text || undefined;
  }
  return toToolTextContent(item);
}
