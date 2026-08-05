// Rekeys temporary live transcript IDs to durable Pi entry IDs when Pi persists messages.
//
// Live transcript rows start under a temporary transport handle and adopt the
// canonical Pi session entry ID when Pi persists the entry. Pi assigns that ID
// inside `appendMessage` and `appendCustomMessageEntry`, after `message_end`,
// and exposes no post-persist event. The observer therefore wraps those methods
// before Pi receives the manager. The wrappers call through without changing
// content or writing the session file.
// Update when: Pi exposes a post-persist event. Replace the append-method wrappers with that event.
//
// Correlation per row kind:
//  - assistant: Pi passes the *same* message object to `message_end` and
//    `appendMessage`, so a WeakMap keyed by the object carries the
//    continuation without retaining message content.
//  - user: nothing to correlate. The instant echo is the *renderer's* own
//    optimistic pending row (composer state, not transcript truth). Main
//    emits the authoritative row born keyed straight from the observed
//    append, deriving the text from the persisted message itself.
//  - tool rows: born keyed. Pi persists the assistant message (with its
//    toolCall blocks) before `tool_execution_start` fires, so this module
//    records the durable `<entryId>:tool:<toolCallId>` derivation here, and
//    the forwarder reads it at row creation. No handle, no rekey.
//  - displayed custom messages: the forwarder holds the row and emits it
//    keyed via a FIFO on `appendCustomMessageEntry` (pi never hands the
//    manager the CustomMessage object, so object identity is unavailable).

import type { SessionManager } from "@earendil-works/pi-coding-agent";

import {
  asRecord,
  extractToolCalls,
  getMessageRole,
  toolItemId,
} from "./transcript";

type OnKeyed = (durableId: string) => void;

export interface TranscriptItemIdentity {
  /** Patch the manager's append methods. Call before Pi receives the manager. */
  observe(manager: SessionManager): void;
  /**
   * Single subscriber notified for every persisted user message. The driver
   * emits the authoritative born-keyed user row from it.
   */
  onUserMessage(cb: (durableId: string, message: unknown) => void): void;
  /** Key a live message row when Pi persists this exact message object. */
  expectMessageKey(message: object, onKeyed: OnKeyed): void;
  /** Pair the next persisted custom message with a held displayed custom row. */
  expectCustomEntry(onKeyed: OnKeyed): void;
  /** Durable tool-row id. Present once the owning assistant entry persisted. */
  toolRowId(toolCallId: string): string | undefined;
}

export function createTranscriptItemIdentity(): TranscriptItemIdentity {
  let onUser: ((durableId: string, message: unknown) => void) | undefined;
  const customQueue: OnKeyed[] = [];
  const byMessage = new WeakMap<object, OnKeyed>();
  const toolRowIds = new Map<string, string>();

  return {
    observe(manager) {
      const appendMessage = manager.appendMessage.bind(manager);
      manager.appendMessage = (message) => {
        const id = appendMessage(message);
        const role = getMessageRole(message);
        if (role === "assistant") {
          for (const call of extractToolCalls(asRecord(message)?.["content"])) {
            toolRowIds.set(call.id, toolItemId(id, call.id));
          }
        }
        // At most one of these fires: user rows have no live counterpart to
        // rekey (the renderer's pending row is composer state), so they
        // notify the subscriber. All other message rows register by object
        // identity.
        if (role === "user") onUser?.(id, message);
        byMessage.get(message)?.(id);
        return id;
      };

      const appendCustom = manager.appendCustomMessageEntry.bind(manager);
      manager.appendCustomMessageEntry = (
        customType,
        content,
        display,
        details,
      ) => {
        const id = appendCustom(customType, content, display, details);
        customQueue.shift()?.(id);
        return id;
      };
    },

    onUserMessage(cb) {
      onUser = cb;
    },

    expectMessageKey(message, onKeyed) {
      byMessage.set(message, onKeyed);
    },

    expectCustomEntry(onKeyed) {
      customQueue.push(onKeyed);
    },

    toolRowId(toolCallId) {
      return toolRowIds.get(toolCallId);
    },
  };
}
