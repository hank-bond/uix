// Renders a user or assistant chat block body as Markdown.

import type { JSX } from "react";

import type { TranscriptItem } from "@uix/api/agent-channels";

import { MarkdownContent } from "./content/MarkdownContent";

export function MessageChatBlockBody({
  item,
}: {
  item: Extract<TranscriptItem, { kind: "user" | "assistant" }>;
}): JSX.Element {
  const text = item.text || (item.kind === "assistant" ? "…" : "");
  return <MarkdownContent text={text} />;
}
