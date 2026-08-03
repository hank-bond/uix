// Renders an error chat block with the failure message.

import type { JSX } from "react";

import type { TranscriptItem } from "@uix/api/agent-channels";

import { ChatBlockFrame } from "./ChatBlockFrame";

export function ErrorChatBlock({
  item,
}: {
  item: Extract<TranscriptItem, { kind: "error" }>;
}): JSX.Element {
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
