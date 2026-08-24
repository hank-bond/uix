// Renders one transcript item as its kind-specific chat block.

import { type JSX, memo } from "react";

import type { TranscriptItem } from "@uix/api/agent-channels";

import { CustomMessageChatBlock } from "./CustomMessageChatBlock";
import { ErrorChatBlock } from "./ErrorChatBlock";
import { MessageChatBlock } from "./MessageChatBlock";
import { ToolChatBlock } from "./ToolChatBlock";

interface ChatBlockProps {
  item: TranscriptItem;
}

// Reducers preserve object identity for unchanged items, so this boundary keeps
// unrelated Chat state and another item's stream updates out of this subtree.
export const ChatBlock = memo(function ChatBlock({
  item,
}: ChatBlockProps): JSX.Element {
  switch (item.kind) {
    case "user":
      return <MessageChatBlock item={item} className="user" />;
    case "assistant":
      return <MessageChatBlock item={item} className="assistant" />;
    case "tool":
      return <ToolChatBlock item={item} />;
    case "custom":
      return <CustomMessageChatBlock item={item} />;
    case "error":
      return <ErrorChatBlock item={item} />;
  }
});
