import type { TranscriptItem } from "@uix/api/agent-channels";
import { isPendingUserId } from "../pending";
import { ChatBlockFrame } from "./ChatBlockFrame";
import { MarkdownContent } from "./MarkdownContent";

export function MessageChatBlock({
  item,
  className,
}: {
  item: Extract<TranscriptItem, { kind: "user" | "assistant" }>;
  className: string;
}) {
  const text = item.text || (item.kind === "assistant" ? "…" : "");
  return (
    <ChatBlockFrame
      className={className}
      kind={item.kind}
      body={<MarkdownContent text={text} />}
      unconfirmed={item.kind === "user" && isPendingUserId(item.id)}
    />
  );
}
