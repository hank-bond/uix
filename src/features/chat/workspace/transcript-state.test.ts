import { describe, expect, it } from "vitest";

import type { AgentEvent, TranscriptItem } from "@uix/api/agent-channels";

import {
  hydrateChatAgentState,
  reduceChatAgentState,
} from "./transcript-state";

const emptyState = { items: [], turnActive: false };

describe("Chat transcript state", () => {
  it("skips represented assistant deltas and applies the stream tail", () => {
    const assistant: TranscriptItem = {
      id: "live:assistant:1",
      kind: "assistant",
      text: "Working",
      complete: false,
    };
    const partial: AgentEvent = {
      type: "transcript_partial",
      id: assistant.id,
      text: "Working",
      textOffset: 0,
    };

    expect(
      hydrateChatAgentState(
        {
          transcript: { items: [assistant] },
          turnActive: true,
        },
        emptyState,
        [
          partial,
          {
            type: "transcript_partial",
            id: assistant.id,
            text: " still",
            textOffset: 7,
          },
        ],
      ),
    ).toEqual({
      items: [{ ...assistant, text: "Working still" }],
      turnActive: true,
    });
  });

  it("preserves unchanged item identities for row-level render containment", () => {
    const user: TranscriptItem = {
      id: "user-1",
      kind: "user",
      text: "question",
    };
    const assistant: TranscriptItem = {
      id: "live:assistant:1",
      kind: "assistant",
      text: "answer",
      complete: false,
    };
    const state = { items: [user, assistant], turnActive: true };

    const next = reduceChatAgentState(state, {
      type: "transcript_partial",
      id: assistant.id,
      text: " continues",
      textOffset: assistant.text.length,
    });

    expect(next.items).not.toBe(state.items);
    expect(next.items[0]).toBe(user);
    expect(next.items[1]).not.toBe(assistant);
  });

  it("replays completion and turn end that land after the captured snapshot", () => {
    const running: TranscriptItem = {
      id: "assistant-1:tool:call-1",
      kind: "tool",
      toolCallId: "call-1",
      toolName: "bash",
      cwd: "/workspace",
      complete: false,
    };
    const completed: TranscriptItem = {
      ...running,
      complete: true,
      result: { content: "done" },
    };

    expect(
      hydrateChatAgentState(
        {
          transcript: { items: [running] },
          turnActive: true,
        },
        emptyState,
        [
          { type: "transcript_replace", item: completed },
          { type: "active_turn_end" },
        ],
      ),
    ).toEqual({ items: [completed], turnActive: false });
  });

  it("replayed appends are idempotent and confirm optimistic user rows", () => {
    const canonical: TranscriptItem = {
      id: "user-1",
      kind: "user",
      text: "hello",
    };
    const pending: TranscriptItem = {
      id: "local:pending:1",
      kind: "user",
      text: "hello",
    };

    expect(
      hydrateChatAgentState(
        {
          transcript: { items: [canonical] },
          turnActive: false,
        },
        { items: [pending], turnActive: false },
        [{ type: "transcript_append", item: canonical }],
      ),
    ).toEqual({ items: [canonical], turnActive: false });
    expect(
      reduceChatAgentState(
        { items: [canonical], turnActive: false },
        { type: "transcript_append", item: canonical },
      ),
    ).toEqual({ items: [canonical], turnActive: false });
  });
});
