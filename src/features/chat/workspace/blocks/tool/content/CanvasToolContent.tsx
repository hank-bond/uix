// Renders canvas tool calls: reason and key summary with anchored payload disclosure.

import type { JSX } from "react";
import { useState } from "react";

import { ToolCallDisclosure } from "./ToolCallDisclosure";
import type { ToolItem, ToolState } from "../presentation";
import { asRecord, toNonEmptyString, toToolTextContent } from "../presentation";

const CanvasToolNames: Readonly<Record<string, string>> = {
  canvas__anchor_read: "Read Canvas",
  canvas__anchor_write: "Write Canvas",
  canvas__anchor_edit: "Edit Canvas",
};

interface CanvasToolPresentation {
  name: string;
  key: string;
  reason?: string;
}

export function CanvasToolContent({
  item,
  state,
  presentation,
}: {
  item: ToolItem;
  state: ToolState;
  presentation: CanvasToolPresentation;
}): JSX.Element {
  const [isExpanded, setIsExpanded] = useState(false);
  const payload = toToolTextContent(item);
  const lines = payload ? stripAnchorGutters(payload).split(/\r?\n/) : [];
  const hasMore = lines.length > 5;
  const visibleLines = isExpanded ? lines : lines.slice(0, 5);

  return (
    <div className="tool-block canvas-tool-block">
      <ToolCallDisclosure
        toolName={presentation.name}
        description={presentation.reason}
        target={presentation.key}
        state={state}
        part="canvas-tool"
      >
        {lines.length ? (
          <div
            className="canvas-tool-block__payload"
            data-uix-part="canvas-tool-payload"
          >
            <pre className="tool-block__payload" data-uix-part="tool-payload">
              {visibleLines.join("\n")}
              {hasMore && !isExpanded ? "\n…" : ""}
            </pre>
            {hasMore ? (
              <button
                className="canvas-tool-block__toggle"
                type="button"
                data-uix-part="canvas-tool-toggle"
                aria-expanded={isExpanded}
                onClick={() => {
                  setIsExpanded((value) => !value);
                }}
              >
                {isExpanded
                  ? "▾ show less"
                  : `▸ show ${String(lines.length - 5)} more line(s)`}
              </button>
            ) : null}
          </div>
        ) : null}
      </ToolCallDisclosure>
    </div>
  );
}

export function tryParseCanvasToolPresentation(
  item: ToolItem,
): CanvasToolPresentation | undefined {
  if (!(item.toolName in CanvasToolNames)) return undefined;
  const name = CanvasToolNames[item.toolName];
  const args = asRecord(item.args);
  const key = toNonEmptyString(args?.["key"]);
  const reason = toNonEmptyString(args?.["reason"]);
  return key ? { name, key, reason } : undefined;
}

function stripAnchorGutters(text: string): string {
  return text
    .split(/\r?\n/)
    .map((line) => {
      const delimiter = line.indexOf("§");
      return delimiter === -1 ? line : line.slice(delimiter + 1);
    })
    .join("\n");
}
