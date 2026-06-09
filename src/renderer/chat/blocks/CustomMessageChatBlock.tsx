import type { TranscriptItem } from "../../../shared/ipc";
import { ChatBlockFrame } from "./ChatBlockFrame";
import { truncateText } from "./content";

export function CustomMessageChatBlock({
  item,
}: {
  item: Extract<TranscriptItem, { kind: "custom" }>;
}) {
  const body = truncateText(item.content) ?? truncateText(item.details) ?? "";
  return (
    <ChatBlockFrame
      className="custom"
      kind="custom"
      customType={item.customType}
      label={item.customType}
      body={body}
    />
  );
}
