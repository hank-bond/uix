import type { TranscriptItem } from "@uix/api/agent-channels";
import { isPendingUserId } from "../pending";
import { ChatBlockFrame } from "./ChatBlockFrame";
import { MarkdownContent } from "./content/MarkdownContent";

export function MessageChatBlock({
  item,
  className,
}: {
  item: Extract<TranscriptItem, { kind: "user" | "assistant" }>;
  className: string;
}): JSX.Element {
  const text = item.text || (item.kind === "assistant" ? "…" : "");
  return (
    <ChatBlockFrame
      className={className}
      kind={item.kind}
      body={<MarkdownContent text={text} />}
      isUnconfirmed={item.kind === "user" && isPendingUserId(item.id)}
    />
  );
}
