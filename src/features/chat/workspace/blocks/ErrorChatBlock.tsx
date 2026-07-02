import type { TranscriptItem } from "@uix/api/agent-channels";
import { ChatBlockFrame } from "./ChatBlockFrame";

export function ErrorChatBlock({
  item,
}: {
  item: Extract<TranscriptItem, { kind: "error" }>;
}) {
  return (
    <ChatBlockFrame
      className="error"
      kind="error"
      state="error"
      label="error"
      body={item.message}
    />
  );
}
