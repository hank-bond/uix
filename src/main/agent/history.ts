// UIX cockpit — session history → transcript mapping.
//
// Pure transform from pi's persisted session entries to the flat HistoryMessage
// list the renderer seeds with on startup. Kept separate from the driver so the
// behavior (what the resumed transcript shows) is testable without pi or IPC.
//
// C0 scope: user + assistant text only. Tool calls/results and other entry
// kinds (thinking/model-change/custom) are dropped here and reintroduced when
// the conversation render registries land.

import type { SessionEntry } from "@earendil-works/pi-coding-agent";

import type { HistoryMessage } from "../../shared/ipc";

export function entriesToMessages(
  entries: readonly SessionEntry[],
): HistoryMessage[] {
  const messages: HistoryMessage[] = [];
  for (const entry of entries) {
    if (entry.type !== "message") continue;
    const role = entry.message.role;
    if (role !== "user" && role !== "assistant") continue;
    const text = extractText(entry.message.content).trim();
    if (text) messages.push({ role, text });
  }
  return messages;
}

// Content is a string or a block array whose text blocks carry `{ type: "text",
// text }`. Read defensively over the block shape so new pi block kinds (tool
// calls, images, thinking) are skipped rather than breaking the mapping.
function extractText(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .filter(
      (block): block is { type: "text"; text: string } =>
        typeof block === "object" &&
        block !== null &&
        (block as { type?: unknown }).type === "text" &&
        typeof (block as { text?: unknown }).text === "string",
    )
    .map((block) => block.text)
    .join("");
}
