import type { TranscriptItem } from "../../../shared/ipc";
import { isPendingUserId } from "../pending";
import { ChatBlockFrame } from "./ChatBlockFrame";

export function MessageChatBlock({
  item,
  label,
  className,
}: {
  item: Extract<TranscriptItem, { kind: "user" | "assistant" }>;
  label: string;
  className: string;
}) {
  const text = item.text || (item.kind === "assistant" ? "…" : "");
  return (
    <ChatBlockFrame
      className={className}
      kind={item.kind}
      label={label}
      body={text}
      unconfirmed={item.kind === "user" && isPendingUserId(item.id)}
    />
  );
}
