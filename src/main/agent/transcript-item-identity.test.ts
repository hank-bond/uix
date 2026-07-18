// Assert the keyed-on-persist correlation contract: each row kind's
// continuation fires with the durable id pi's append returns, tool rows
// derive the same id replay produces, and the wrapper stays a pass-through.

import type { SessionManager } from "@earendil-works/pi-coding-agent";

import { describe, expect, it, vi } from "vitest";

import { createTranscriptItemIdentity } from "./transcript-item-identity";
import { toTranscriptItems } from "./transcript";

function fakeManager() {
  let next = 1;
  const appendMessage = vi.fn(() => `entry-${next++}`);
  const appendCustomMessageEntry = vi.fn(() => `entry-${next++}`);
  const manager = {
    appendMessage,
    appendCustomMessageEntry,
  } as unknown as SessionManager;
  return { manager, appendMessage, appendCustomMessageEntry };
}

describe("createTranscriptItemIdentity", () => {
  it("keys an assistant row by message object identity", () => {
    const identity = createTranscriptItemIdentity();
    const { manager } = fakeManager();
    identity.observe(manager);

    const message = { role: "assistant", content: "hi" };
    const onKeyed = vi.fn();
    identity.expectMessageKey(message, onKeyed);

    const id = manager.appendMessage(message as never);
    expect(onKeyed).toHaveBeenCalledWith(id);
  });

  it("notifies the user-message subscriber only for user appends", () => {
    const identity = createTranscriptItemIdentity();
    const { manager } = fakeManager();
    identity.observe(manager);

    const onUser = vi.fn();
    identity.onUserMessage(onUser);

    manager.appendMessage({ role: "toolResult", content: "" } as never);
    expect(onUser).not.toHaveBeenCalled();

    const message = { role: "user", content: "one" };
    const id = manager.appendMessage(message as never);
    expect(onUser).toHaveBeenCalledWith(id, message);
  });

  it("derives born-keyed tool row ids that match replay", () => {
    const identity = createTranscriptItemIdentity();
    const { manager } = fakeManager();
    identity.observe(manager);

    expect(identity.toolRowId("call-1")).toBeUndefined();

    const message = {
      role: "assistant",
      content: [
        { type: "toolCall", id: "call-1", name: "canvas__anchor_edit" },
        { type: "toolCall", id: "call-2", name: "canvas__anchor_read" },
      ],
    };
    const entryId = manager.appendMessage(message as never);
    expect(identity.toolRowId("call-1")).toBe(`${entryId}:tool:call-1`);
    expect(identity.toolRowId("call-2")).toBe(`${entryId}:tool:call-2`);

    // The live id must equal what history replay produces for the same entry,
    // or live and replayed state would key differently.
    const replayed = toTranscriptItems([
      {
        type: "message",
        id: entryId,
        parentId: null,
        timestamp: "",
        message,
      } as never,
    ]);
    expect(replayed).toEqual([
      expect.objectContaining({ id: identity.toolRowId("call-1") }),
      expect.objectContaining({ id: identity.toolRowId("call-2") }),
    ]);
  });

  it("keys held custom rows on custom-entry persist", () => {
    const identity = createTranscriptItemIdentity();
    const { manager } = fakeManager();
    identity.observe(manager);

    const onKeyed = vi.fn();
    identity.expectCustomEntry(onKeyed);

    const id = manager.appendCustomMessageEntry("uix.note", "hello", true);
    expect(onKeyed).toHaveBeenCalledWith(id);
  });

  it("passes append arguments and return values through unchanged", () => {
    const identity = createTranscriptItemIdentity();
    const { manager, appendMessage, appendCustomMessageEntry } = fakeManager();
    identity.observe(manager);

    const message = { role: "user", content: "hi" };
    const id = manager.appendMessage(message as never);
    expect(appendMessage).toHaveBeenCalledWith(message);
    expect(id).toBe(appendMessage.mock.results[0]?.value);

    const customId = manager.appendCustomMessageEntry("uix.note", "x", false, {
      a: 1,
    });
    expect(appendCustomMessageEntry).toHaveBeenCalledWith(
      "uix.note",
      "x",
      false,
      {
        a: 1,
      },
    );
    expect(customId).toBe(appendCustomMessageEntry.mock.results[0]?.value);
  });
});
