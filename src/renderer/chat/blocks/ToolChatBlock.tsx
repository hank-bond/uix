import { ChatBlockFrame } from "./ChatBlockFrame";
import { CanvasToolContent } from "./CanvasToolContent";
import { DefaultToolContent } from "./DefaultToolContent";
import { toToolState } from "./tool";
import type { ToolChatRenderer, ToolItem } from "./tool";

const toolChatRenderers = new Map<string, ToolChatRenderer>();

registerToolChatRenderer("uix_canvas_read", {
  render: (props) => <CanvasToolContent {...props} label="Read Canvas" />,
});
registerToolChatRenderer("uix_canvas_write", {
  render: (props) => <CanvasToolContent {...props} label="Write Canvas" />,
});
registerToolChatRenderer("uix_canvas_edit", {
  render: (props) => <CanvasToolContent {...props} label="Edit Canvas" />,
});

export function ToolChatBlock({ item }: { item: ToolItem }) {
  const state = toToolState(item);
  const renderer = toolChatRenderers.get(item.toolName);
  return (
    <ChatBlockFrame
      className={item.isError ? "tool-error" : "tool"}
      kind="tool"
      state={state}
      toolName={item.toolName}
      label={item.isError ? "tool error" : "tool"}
      body={
        renderer ? (
          renderer.render({ item, state })
        ) : (
          <DefaultToolContent item={item} state={state} />
        )
      }
    />
  );
}

function registerToolChatRenderer(
  toolName: string,
  renderer: ToolChatRenderer,
): void {
  toolChatRenderers.set(toolName, renderer);
}
