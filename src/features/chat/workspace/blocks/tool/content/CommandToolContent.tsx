import { CodeBlock } from "../../content/CodeBlock";
import { HighlightedCode } from "../../content/HighlightedCode";
import { toToolTextContent } from "../rendering";
import type { ToolItem } from "../rendering";
import { DefaultToolContent } from "./DefaultToolContent";

interface CommandToolPresentation {
  command: string;
  reason: string;
}

export function CommandToolContent({ item }: { item: ToolItem }) {
  const presentation = tryParseCommandToolPresentation(item);
  if (!presentation) return <DefaultToolContent item={item} />;
  const output = toCommandOutput(item);

  return (
    <div className="tool-block command-tool-block" data-uix-part="command-tool">
      <details
        className="tool-block__details"
        data-uix-part="command-disclosure"
      >
        <summary>command and output</summary>
        <div className="command-tool-block__details">
          <span className="command-tool-block__section-label">command</span>
          <CodeBlock>
            <HighlightedCode text={presentation.command} language="bash" />
          </CodeBlock>
          {output !== undefined ? (
            <>
              <span className="command-tool-block__section-label">output</span>
              <CodeBlock>
                <HighlightedCode text={output} />
              </CodeBlock>
            </>
          ) : null}
        </div>
      </details>
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
