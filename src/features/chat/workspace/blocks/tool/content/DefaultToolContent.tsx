// Renders the default tool block: payload text with optional args disclosure.

import type { JSX } from "react";

import { truncateText } from "../../content/text";
import type { ToolItem } from "../presentation";
import { toToolPayloadText } from "../presentation";

export function DefaultToolContent({ item }: { item: ToolItem }): JSX.Element {
  const payload = toToolPayloadText(item);
  const args = item.complete ? truncateText(item.args) : undefined;

  return (
    <div className="tool-block" data-uix-part="tool">
      {payload ? (
        <pre className="tool-block__payload" data-uix-part="tool-payload">
          {payload}
        </pre>
      ) : null}
      {args ? (
        <details className="tool-block__details" data-uix-part="tool-details">
          <summary>arguments</summary>
          <pre>{args}</pre>
        </details>
      ) : null}
    </div>
  );
}
