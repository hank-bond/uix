// Renders the default tool expanded content: payload text with optional args disclosure.

import type { JSX } from "react";

import { truncateText } from "../../content/transcript-text";
import type { ToolItem } from "../call-presentation";
import { toToolPayloadText } from "../call-presentation";

export function DefaultToolContent({ item }: { item: ToolItem }): JSX.Element {
  const payload = toToolPayloadText(item);
  const args = item.complete ? truncateText(item.args) : undefined;

  return (
    <>
      {payload === "" && item.complete ? (
        <span className="tool-call__empty">No output</span>
      ) : payload ? (
        <pre className="tool-block__payload" data-block-part="tool-payload">
          {payload}
        </pre>
      ) : null}
      {args ? (
        <details className="tool-block__details" data-block-part="tool-details">
          <summary>arguments</summary>
          <pre>{args}</pre>
        </details>
      ) : null}
    </>
  );
}
