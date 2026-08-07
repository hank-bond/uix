// Renders command tool output: highlighted command and result disclosure.

import type { JSX } from "react";

import { CommandBlockSettings } from "./CommandBlockSettings";
import { DefaultToolContent } from "./DefaultToolContent";
import { StructuredCommand } from "./StructuredCommand";
import { ToolCallDisclosure } from "./ToolCallDisclosure";
import { useBlockPresentationSettings } from "../../BlockPresentationSettings";
import { CodeBlock } from "../../content/CodeBlock";
import { HighlightedCode } from "../../content/HighlightedCode";
import type { ToolItem, ToolState } from "../presentation";
import { toToolTextContent } from "../presentation";

interface CommandToolPresentation {
  command: string;
  reason: string;
}

export function CommandToolContent({
  item,
  state,
}: {
  item: ToolItem;
  state: ToolState;
}): JSX.Element {
  const { settings } = useBlockPresentationSettings();
  const presentation = tryParseCommandToolPresentation(item);
  if (!presentation) return <DefaultToolContent item={item} />;
  const output = toCommandOutput(item);

  return (
    <div className="tool-block command-tool-block">
      <ToolCallDisclosure
        toolName="command"
        description={presentation.reason}
        state={state}
        part="command-tool"
        actions={<CommandBlockSettings />}
      >
        <div className="command-tool-block__details">
          <CodeBlock className="command-tool-block__command">
            <StructuredCommand
              command={presentation.command}
              layout={settings.command.layout}
            />
          </CodeBlock>
          {output !== undefined ? (
            <>
              <span className="tool-call__section-label">output</span>
              <CodeBlock>
                <HighlightedCode text={output} />
              </CodeBlock>
            </>
          ) : null}
        </div>
      </ToolCallDisclosure>
    </div>
  );
}

export function tryParseCommandToolPresentation(
  item: ToolItem,
): CommandToolPresentation | undefined {
  if (item.toolName !== "command") return undefined;
  const args = asRecord(item.args);
  const command = toString(args?.["command"]);
  const reason = toString(args?.["reason"])?.trim();
  if (!command?.trim() || !reason) return undefined;
  return { command, reason };
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

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function toString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}
