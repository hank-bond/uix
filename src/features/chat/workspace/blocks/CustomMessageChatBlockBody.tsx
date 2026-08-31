// Renders a custom-message chat block body from its content or details text.

import type { JSX } from "react";

import type { TranscriptItem } from "@uix/api/agent-channels";

import { truncateText } from "./content/transcript-text";

export function CustomMessageChatBlockBody({
  item,
}: {
  item: Extract<TranscriptItem, { kind: "custom" }>;
}): JSX.Element {
  return <>{truncateText(item.content) ?? truncateText(item.details) ?? ""}</>;
}
