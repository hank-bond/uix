import type { TranscriptItem } from "../../../shared/ipc";
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
