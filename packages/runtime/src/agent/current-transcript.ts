// Materializes one Agent instance's durable transcript seed plus live transcript updates.

import type {
  AgentEvent,
  TranscriptItem,
  TranscriptSnapshot,
} from "@uix/api/agent-channels";

export interface CurrentTranscript {
  /** Apply one normalized live event to the current read model. */
  apply(event: AgentEvent): void;
  /** Return a point-in-time copy of the current transcript. */
  getSnapshot(): TranscriptSnapshot;
}

/** Creates the current transcript read model for one Agent instance. */
export function createCurrentTranscript(
  initial: TranscriptSnapshot,
): CurrentTranscript {
  let items = [...initial.items];

  return {
    apply(event) {
      items = applyTranscriptEvent(items, event);
    },
    getSnapshot: () => ({ items: [...items] }),
  };
}

function applyTranscriptEvent(
  items: TranscriptItem[],
  event: AgentEvent,
): TranscriptItem[] {
  switch (event.type) {
    case "transcript_append":
      return upsert(items, event.item);

    case "transcript_replace":
      return replace(items, event.item, event.previousId);

    case "transcript_partial": {
      const index = lastIndexById(items, event.id);
      if (index === -1) return items;
      const item = items[index];
      let next: TranscriptItem;
      if (item.kind === "assistant" && "text" in event) {
        if (item.complete || item.text.length !== event.textOffset)
          return items;
        next = { ...item, text: item.text + event.text };
      } else if (item.kind === "tool" && "partialResult" in event) {
        next = { ...item, partialResult: event.partialResult };
      } else {
        return items;
      }
      return [...items.slice(0, index), next, ...items.slice(index + 1)];
    }

    case "active_turn_start":
    case "active_turn_end":
    case "agent_start":
    case "agent_end":
    case "turn_start":
    case "turn_end":
      return items;
  }
}

function upsert(
  items: TranscriptItem[],
  item: TranscriptItem,
): TranscriptItem[] {
  const index = lastIndexById(items, item.id);
  return index === -1
    ? [...items, item]
    : [...items.slice(0, index), item, ...items.slice(index + 1)];
}

function replace(
  items: TranscriptItem[],
  item: TranscriptItem,
  previousId?: string,
): TranscriptItem[] {
  let index = lastIndexById(items, item.id);
  if (index === -1 && previousId !== undefined) {
    index = lastIndexById(items, previousId);
  }
  return index === -1
    ? [...items, item]
    : [...items.slice(0, index), item, ...items.slice(index + 1)];
}

function lastIndexById(items: TranscriptItem[], id: string): number {
  for (let i = items.length - 1; i >= 0; i--) {
    if (items[i].id === id) return i;
  }
  return -1;
}
