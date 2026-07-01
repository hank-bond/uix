import { truncateText } from "./content";
import {
  toToolDisplayName,
  toToolPayloadText,
  toToolStatusLabel,
} from "./tool";
import type { ToolItem, ToolState } from "./tool";

export function DefaultToolContent({
  item,
  state,
}: {
  item: ToolItem;
  state: ToolState;
}) {
  const payload = toToolPayloadText(item);
  const args = item.complete ? truncateText(item.args) : undefined;

  return (
    <div className="tool-block" data-uix-part="tool">
      <div className="tool-block__header" data-uix-part="tool-header">
        <span className="tool-block__status" data-uix-part="tool-status">
          {toToolStatusLabel(state)}
        </span>
        <span className="tool-block__name" data-uix-part="tool-name">
          {toToolDisplayName(item.toolName)}
        </span>
      </div>
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
