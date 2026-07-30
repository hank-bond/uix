import { ChatBlockFrame } from "./ChatBlockFrame";
import { CanvasToolContent } from "./CanvasToolContent";
import {
  asCommandToolPresentation,
  CommandToolContent,
} from "./CommandToolContent";
import { DefaultToolContent } from "./DefaultToolContent";
import { FileToolContent } from "./FileToolContent";
import { toToolDisplayName, toToolState } from "./tool";
import type { ToolChatRenderer, ToolItem } from "./tool";

const toolChatRenderers = new Map<string, ToolChatRenderer>();

registerToolChatRenderer("canvas__anchor_read", {
  displayName: "Read Canvas",
  render: ({ item }) => <CanvasToolContent item={item} />,
});
registerToolChatRenderer("canvas__anchor_write", {
  displayName: "Write Canvas",
  render: ({ item }) => <CanvasToolContent item={item} />,
});
registerToolChatRenderer("canvas__anchor_edit", {
  displayName: "Edit Canvas",
  render: ({ item }) => <CanvasToolContent item={item} />,
});
registerToolChatRenderer("read", {
  displayName: "read",
  render: ({ item }) => <FileToolContent item={item} />,
});
registerToolChatRenderer("write", {
  displayName: "write",
  render: ({ item }) => <FileToolContent item={item} />,
});
registerToolChatRenderer("command", {
  displayName: "command",
  renderLabel: ({ item }) => {
    const presentation = asCommandToolPresentation(item);
    return presentation ? (
      <>
        command: <span data-uix-part="tool-reason">{presentation.reason}</span>
      </>
    ) : undefined;
  },
  render: ({ item }) => <CommandToolContent item={item} />,
});

export function ToolChatBlock({ item }: { item: ToolItem }) {
  const state = toToolState(item);
  const renderer = toolChatRenderers.get(item.toolName);
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

function registerToolChatRenderer(
  toolName: string,
  renderer: ToolChatRenderer,
): void {
  toolChatRenderers.set(toolName, renderer);
}
