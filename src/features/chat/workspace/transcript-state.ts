// Reconciles current Agent snapshots, live events, and renderer-local optimistic rows.

import type {
  AgentEvent,
  AgentSnapshot,
  TranscriptItem,
} from "@uix/api/agent-channels";

import { isPendingUserId } from "./pending";

export interface ChatAgentState {
  readonly items: TranscriptItem[];
  readonly turnActive: boolean;
}

/** Apply one idempotent Agent event to Chat's selected-Agent state. */
export function reduceChatAgentState(
  prev: ChatAgentState,
  event: AgentEvent,
): ChatAgentState {
  if (event.type === "active_turn_start") {
    return prev.turnActive ? prev : { ...prev, turnActive: true };
  }
  if (event.type === "active_turn_end") {
    return prev.turnActive ? { ...prev, turnActive: false } : prev;
  }

  const items = reduceTranscriptItems(prev.items, event);
  return items === prev.items ? prev : { ...prev, items };
}

/** Install a current snapshot, preserve local rows, then replay the live tail. */
export function hydrateChatAgentState(
  snapshot: AgentSnapshot,
  current: ChatAgentState,
  bufferedEvents: readonly AgentEvent[],
): ChatAgentState {
  const snapshotItems = snapshot.transcript.items.filter(isVisible);
  const localItems = current.items.filter((item) =>
    item.id.startsWith("local:"),
  );
  return bufferedEvents.reduce(reduceChatAgentState, {
    items: [...snapshotItems, ...localItems],
    turnActive: snapshot.turnActive,
  });
}

function reduceTranscriptItems(
  prev: TranscriptItem[],
  event: AgentEvent,
): TranscriptItem[] {
  switch (event.type) {
    case "transcript_append":
      return isVisible(event.item) ? appendItem(prev, event.item) : prev;

    case "transcript_replace":
      return syncItem(prev, event.item, event.previousId);

    case "transcript_partial":
      return applyPartial(prev, event);

    case "active_turn_start":
    case "active_turn_end":
    case "agent_start":
    case "agent_end":
    case "turn_start":
    case "turn_end":
      return prev;
  }
}

// Append idempotently, or confirm an optimistic pending user row in place.
function appendItem(
  items: TranscriptItem[],
  item: TranscriptItem,
): TranscriptItem[] {
  if (item.kind === "user") {
    const pendingIndex = items.findIndex(
      (existing) =>
        existing.kind === "user" &&
        isPendingUserId(existing.id) &&
        existing.text === item.text,
    );
    if (pendingIndex !== -1) {
      return upsert(
        [...items.slice(0, pendingIndex), ...items.slice(pendingIndex + 1)],
        item,
      );
    }
  }
  return upsert(items, item);
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

// Reconcile an item's presence in the list to match its visibility. A rekey
// names the pre-key transport handle. Matching the new id first keeps a
// replayed rekey idempotent.
function syncItem(
  items: TranscriptItem[],
  item: TranscriptItem,
  previousId?: string,
): TranscriptItem[] {
  let index = lastIndexById(items, item.id);
  if (index === -1 && previousId !== undefined) {
    index = lastIndexById(items, previousId);
  }

  if (!isVisible(item)) {
    return index === -1
      ? items
      : [...items.slice(0, index), ...items.slice(index + 1)];
  }
  if (index === -1) {
    // eslint-disable-next-line no-console -- ordering-broke diagnostic. The renderer has no logger facility
    console.warn("transcript_replace inserted a net-new item", item.id);
    return [...items, item];
  }
  return [...items.slice(0, index), item, ...items.slice(index + 1)];
}

// Tool progress is a replacement value. Assistant text carries its append
// offset, so a delta already represented by the snapshot is skipped.
function applyPartial(
  items: TranscriptItem[],
  event: Extract<AgentEvent, { type: "transcript_partial" }>,
): TranscriptItem[] {
  const index = lastIndexById(items, event.id);
  if (index === -1) {
    // eslint-disable-next-line no-console -- ordering-broke diagnostic. The renderer has no logger facility
    console.warn("transcript_partial for unknown item", event.id);
    return items;
  }
  const item = items[index];
  let next: TranscriptItem;
  if (item.kind === "assistant" && "text" in event) {
    if (item.complete || item.text.length !== event.textOffset) return items;
    next = { ...item, text: item.text + event.text };
  } else if (item.kind === "tool" && "partialResult" in event) {
    next = { ...item, partialResult: event.partialResult };
  } else {
    return items;
  }
  return [...items.slice(0, index), next, ...items.slice(index + 1)];
}

function lastIndexById(items: readonly TranscriptItem[], id: string): number {
  for (let i = items.length - 1; i >= 0; i--) {
    if (items[i].id === id) return i;
  }
  return -1;
}

function isVisible(item: TranscriptItem): boolean {
  return item.kind !== "custom" || item.display;
}
