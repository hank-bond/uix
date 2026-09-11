// Renders shell tool expanded content: highlighted command and result disclosure.

import type { JSX } from "react";

import { StructuredCommand } from "./StructuredCommand";
import { useBlockPresentationSettings } from "../../BlockPresentationSettings";
import { CodeBlock } from "../../content/CodeBlock";
import { HighlightedCode } from "../../content/HighlightedCode";
import type { ToolItem } from "../call-presentation";
import { asRecord, toString, toToolTextContent } from "../call-presentation";

export function ShellToolContent({ item }: { item: ToolItem }): JSX.Element {
  const { settings } = useBlockPresentationSettings();
  const args = asRecord(item.args);
  const command = toString(args?.["command"]);
  const output = toCommandOutput(item);

  return (
    <div className="shell-tool-block__details">
      {command ? (
        <CodeBlock className="shell-tool-block__command">
          <StructuredCommand command={command} layout={settings.shell.layout} />
        </CodeBlock>
      ) : null}
      {output !== undefined && (output !== "" || item.complete) ? (
        <>
          <span className="tool-call__section-label">output</span>
          {output === "" ? (
            <span className="tool-call__empty">No output</span>
          ) : (
            <CodeBlock>
              <HighlightedCode text={output} />
            </CodeBlock>
          )}
        </>
      ) : null}
    </div>
  );
}

function toCommandOutput(item: ToolItem): string | undefined {
  const value = item.complete ? item.result : item.partialResult;
  const content = asRecord(value)?.["content"];
  if (Array.isArray(content)) {
    const parts = content.flatMap((entry) => {
      const block = asRecord(entry);
      return block?.["type"] === "text" && typeof block["text"] === "string"
        ? [block["text"]]
        : [];
    });
    return parts.length ? parts.join("") : undefined;
  }
  return toToolTextContent(item);
}
