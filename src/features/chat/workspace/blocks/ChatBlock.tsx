import type { TranscriptItem } from "#shared/ipc";
import { CustomMessageChatBlock } from "./CustomMessageChatBlock";
import { ErrorChatBlock } from "./ErrorChatBlock";
import { MessageChatBlock } from "./MessageChatBlock";
import { ToolChatBlock } from "./ToolChatBlock";

export interface ChatBlockProps {
  item: TranscriptItem;
}

export function ChatBlock({ item }: ChatBlockProps) {
  switch (item.kind) {
    case "user":
      return <MessageChatBlock item={item} label="user" className="user" />;
    case "assistant":
      return (
        <MessageChatBlock item={item} label="assistant" className="assistant" />
      );
    case "tool":
      return <ToolChatBlock item={item} />;
    case "custom":
      return <CustomMessageChatBlock item={item} />;
    case "error":
      return <ErrorChatBlock item={item} />;
  }
}
