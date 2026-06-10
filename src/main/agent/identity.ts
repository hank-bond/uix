// UIX cockpit — transcript identity (keyed-on-persist).
//
// Implements docs/decisions/2026-06-09-transcript-keyed-on-persist.md: live
// transcript rows start under a pre-key transport handle and are rekeyed to
// the canonical pi session entry id the moment pi persists the entry. Pi
// mints that id inside `appendMessage` / `appendCustomMessageEntry` — *after*
// the `message_end` listeners run, and there is no post-persist event — so
// the only way to observe it is to patch those methods on the manager
// instance before pi receives it. The patch calls through to the original;
// it never mutates content and never writes the session file itself. Replace
// it with pi's official post-persist event if one ships.
//
// Correlation per row kind (docs/plans/durable-transcript-identity.md, D1):
//  - assistant: pi passes the *same* message object to `message_end` and
//    `appendMessage`, so a WeakMap keyed by the object carries the
//    continuation without retaining message content.
//  - user: nothing to correlate — the instant echo is the *renderer's* own
//    optimistic pending row (composer state, not transcript truth); main
//    emits the authoritative row born keyed straight from the observed
//    append, deriving the text from the persisted message itself.
//  - tool rows: born keyed — pi persists the assistant message (with its
//    toolCall blocks) before `tool_execution_start` fires, so the durable
//    `<entryId>:tool:<toolCallId>` derivation is recorded here and read by
//    the forwarder at row creation. No handle, no rekey.
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

export interface TranscriptIdentity {
  /** Patch the manager's append methods. Call before pi receives the manager. */
  observe(manager: SessionManager): void;
  /**
   * Single subscriber notified for every persisted user message; the driver
   * emits the authoritative born-keyed user row from it.
   */
  onUserMessage(cb: (durableId: string, message: unknown) => void): void;
  /** Key a live message row when this exact message object is persisted. */
  expectMessageKey(message: object, onKeyed: OnKeyed): void;
  /** Pair the next persisted custom message with a held displayed custom row. */
  expectCustomEntry(onKeyed: OnKeyed): void;
  /** Durable tool-row id; present once the owning assistant entry persisted. */
  toolRowId(toolCallId: string): string | undefined;
}

export function createTranscriptIdentity(): TranscriptIdentity {
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
        // notify the subscriber; all other message rows register by object
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
