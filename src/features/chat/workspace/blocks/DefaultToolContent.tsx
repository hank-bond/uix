import { truncateText } from "./content";
import { toToolPayloadText } from "./tool";
import type { ToolItem } from "./tool";

export function DefaultToolContent({ item }: { item: ToolItem }) {
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
