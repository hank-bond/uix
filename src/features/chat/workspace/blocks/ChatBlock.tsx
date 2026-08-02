import type { TranscriptItem } from "@uix/api/agent-channels";
import { CustomMessageChatBlock } from "./CustomMessageChatBlock";
import { ErrorChatBlock } from "./ErrorChatBlock";
import { MessageChatBlock } from "./MessageChatBlock";
import { ToolChatBlock } from "./ToolChatBlock";

interface ChatBlockProps {
  item: TranscriptItem;
}

export function ChatBlock({ item }: ChatBlockProps): JSX.Element {
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
}
