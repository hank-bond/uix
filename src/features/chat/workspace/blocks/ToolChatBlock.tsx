import { ChatBlockFrame } from "./ChatBlockFrame";
import { getToolChatRenderer } from "./tool/renderers";
import { DefaultToolContent } from "./tool/content/DefaultToolContent";
import { toToolDisplayName, toToolState } from "./tool/rendering";
import type { ToolItem } from "./tool/rendering";

export function ToolChatBlock({ item }: { item: ToolItem }) {
  const state = toToolState(item);
  const renderer = getToolChatRenderer(item.toolName);
  const name = renderer?.displayName ?? toToolDisplayName(item.toolName);
  const renderedLabel = renderer?.renderLabel?.({ item, state });
  const label = renderedLabel ?? (
    <>
      tool: <span data-uix-part="tool-name">{name}</span>
    </>
  );
  return (
    <ChatBlockFrame
      className={item.isError ? "tool-error" : "tool"}
      kind="tool"
      state={state}
      toolName={item.toolName}
      label={
        <>
          {label}
          {item.isError ? " (error)" : ""}
        </>
      }
      body={
        renderer ? (
          renderer.render({ item, state })
        ) : (
          <DefaultToolContent item={item} />
        )
      }
    />
  );
}
