import { useState } from "react";

import { toToolStatusLabel, toToolTextContent } from "./tool";
import type { ToolItem, ToolState } from "./tool";

export function CanvasToolContent({
  item,
  state,
  label,
}: {
  item: ToolItem;
  state: ToolState;
  label: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const payload = toToolTextContent(item);
  const lines = payload ? stripAnchorGutters(payload).split(/\r?\n/) : [];
  const hasMore = lines.length > 5;
  const visibleLines = expanded ? lines : lines.slice(0, 5);

  return (
    <div className="tool-block canvas-tool-block" data-uix-part="canvas-tool">
      <div className="tool-block__header" data-uix-part="tool-header">
        <span className="tool-block__status" data-uix-part="tool-status">
          {toToolStatusLabel(state)}
        </span>
        <span className="tool-block__name" data-uix-part="tool-name">
          {label}
        </span>
      </div>
      {visibleLines.length ? (
        <div
          className="canvas-tool-block__payload"
          data-uix-part="canvas-tool-payload"
        >
          <pre className="tool-block__payload" data-uix-part="tool-payload">
            {visibleLines.join("\n")}
            {hasMore && !expanded ? "\n…" : ""}
          </pre>
          {hasMore ? (
            <button
              className="canvas-tool-block__toggle"
              type="button"
              data-uix-part="canvas-tool-toggle"
              aria-expanded={expanded}
              onClick={() => setExpanded((value) => !value)}
            >
              {expanded
                ? "▾ show less"
                : `▸ show ${lines.length - 5} more line(s)`}
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
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
