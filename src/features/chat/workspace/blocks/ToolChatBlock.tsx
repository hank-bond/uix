import type { JSX } from "react";
import { ChatBlockFrame } from "./ChatBlockFrame";
import { toToolState } from "./tool/presentation";
import type { ToolItem } from "./tool/presentation";
import { deriveToolChatBlockPresentation } from "./tool/presentations";

export function ToolChatBlock({ item }: { item: ToolItem }): JSX.Element {
  const state = toToolState(item);
  const presentation = deriveToolChatBlockPresentation(item, state);
  return (
    <ChatBlockFrame
      className={state === "error" ? "tool-error" : "tool"}
      kind="tool"
      state={state}
      toolName={item.toolName}
      label={presentation.label}
      body={presentation.content}
    />
  );
}
