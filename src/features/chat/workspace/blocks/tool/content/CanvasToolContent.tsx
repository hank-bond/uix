import { useState } from "react";
import type { JSX } from "react";

import { toToolTextContent } from "../presentation";
import type { ToolItem } from "../presentation";

export function CanvasToolContent({ item }: { item: ToolItem }): JSX.Element {
  const [isExpanded, setIsExpanded] = useState(false);
  const payload = toToolTextContent(item);
  const lines = payload ? stripAnchorGutters(payload).split(/\r?\n/) : [];
  const hasMore = lines.length > 5;
  const visibleLines = isExpanded ? lines : lines.slice(0, 5);

  return (
    <div className="tool-block canvas-tool-block" data-uix-part="canvas-tool">
      {visibleLines.length ? (
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
              onClick={() => setIsExpanded((value) => !value)}
            >
              {isExpanded
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
