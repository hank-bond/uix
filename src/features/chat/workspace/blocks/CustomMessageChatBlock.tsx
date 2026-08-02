import type { JSX } from "react";
import type { TranscriptItem } from "@uix/api/agent-channels";
import { ChatBlockFrame } from "./ChatBlockFrame";
import { truncateText } from "./content/text";

export function CustomMessageChatBlock({
  item,
}: {
  item: Extract<TranscriptItem, { kind: "custom" }>;
}): JSX.Element {
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
