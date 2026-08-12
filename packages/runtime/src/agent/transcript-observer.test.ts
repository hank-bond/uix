import type {
  AgentSession,
  AgentSessionEvent,
  SessionManager,
} from "@earendil-works/pi-coding-agent";
import { describe, expect, it, type Mock, vi } from "vitest";

import type { AgentEvent } from "@uix/api/agent-channels";

import { createEphemeralTranscriptItemIdSequence } from "./transcript";
import { createTranscriptObserver } from "./transcript-observer";

function createManager(cwd = "/workspace"): SessionManager {
  let nextEntryId = 1;
  return {
    getCwd: () => cwd,
    appendMessage: () => `entry-${String(nextEntryId++)}`,
    appendCustomMessageEntry: () => `entry-${String(nextEntryId++)}`,
  } as unknown as SessionManager;
}

function createSession(manager: SessionManager): {
  session: AgentSession;
  unsubscribe: Mock;
  emit: (event: object) => void;
} {
  let listener: ((event: AgentSessionEvent) => void) | undefined;
  const unsubscribe = vi.fn(() => {
    listener = undefined;
  });
  const session = {
    sessionManager: manager,
    subscribe: vi.fn((nextListener: (event: AgentSessionEvent) => void) => {
      listener = nextListener;
      return unsubscribe;
    }),
  } as unknown as AgentSession;
  return {
    session,
    unsubscribe,
    emit(event: object) {
      listener?.(event as AgentSessionEvent);
    },
  };
}

function createHarness(): {
  observer: ReturnType<typeof createTranscriptObserver>;
  events: AgentEvent[];
} {
  const events: AgentEvent[] = [];
  const observer = createTranscriptObserver({
    emit: (event) => events.push(event),
    ephemeralIds: createEphemeralTranscriptItemIdSequence(),
  });
  return { observer, events };
}

describe("TranscriptObserver", () => {
  it("observes each manager once and publishes persisted user rows born keyed", () => {
    const { observer, events } = createHarness();
    const manager = createManager();
    observer.instrumentSessionManager(manager);
    observer.instrumentSessionManager(manager);

    manager.appendMessage({ role: "user", content: "  hello  " } as never);

    expect(events).toEqual([
      {
        type: "transcript_append",
        item: { id: "entry-1", kind: "user", text: "hello" },
      },
    ]);
  });

  it("streams an assistant row and rekeys it when Pi persists the message", () => {
    const { observer, events } = createHarness();
    const manager = createManager();
    const active = createSession(manager);
    observer.instrumentSessionManager(manager);
    observer.bindSession(active.session);
    const message = {
      role: "assistant",
      content: [{ type: "text", text: "final answer" }],
    };

    active.emit({ type: "message_start", message });
    const liveId = (
      events[0] as Extract<AgentEvent, { type: "transcript_append" }>
    ).item.id;
    active.emit({
      type: "message_update",
      message,
      assistantMessageEvent: { type: "text_delta", delta: "final " },
    });
    active.emit({ type: "message_end", message });
    manager.appendMessage(message as never);

    expect(events).toEqual([
      {
        type: "transcript_append",
        item: {
          id: liveId,
          kind: "assistant",
          text: "",
          complete: false,
        },
      },
      {
        type: "transcript_partial",
        id: liveId,
        text: "final ",
      },
      {
        type: "transcript_replace",
        item: {
          id: liveId,
          kind: "assistant",
          text: "final answer",
          complete: true,
        },
      },
      {
        type: "transcript_replace",
        previousId: liveId,
        item: {
          id: "entry-1",
          kind: "assistant",
          text: "final answer",
          complete: true,
        },
      },
    ]);
  });

  it("publishes self-contained file locations on live tool rows", () => {
    const { observer, events } = createHarness();
    const manager = createManager("/workspace");
    const active = createSession(manager);
    observer.instrumentSessionManager(manager);
    manager.appendMessage({
      role: "assistant",
      content: [
        {
          type: "toolCall",
          id: "call-1",
          name: "read",
          arguments: { path: "src/main.ts" },
        },
      ],
    } as never);
    observer.bindSession(active.session);

    active.emit({
      type: "tool_execution_start",
      toolCallId: "call-1",
      toolName: "read",
      args: { path: "src/main.ts" },
    });
    active.emit({
      type: "tool_execution_update",
      toolCallId: "call-1",
      toolName: "read",
      partialResult: { content: "partial" },
    });
    active.emit({
      type: "tool_execution_end",
      toolCallId: "call-1",
      toolName: "read",
      result: { content: "complete" },
      isError: false,
    });

    const item = {
      id: "entry-1:tool:call-1",
      kind: "tool" as const,
      toolCallId: "call-1",
      toolName: "read",
      cwd: "/workspace",
      file: {
        absolutePath: "/workspace/src/main.ts",
        displayPath: "src/main.ts",
      },
      args: { path: "src/main.ts" },
    };
    expect(events).toEqual([
      {
        type: "transcript_append",
        item: { ...item, complete: false },
      },
      {
        type: "transcript_partial",
        id: item.id,
        partialResult: { content: "partial" },
      },
      {
        type: "transcript_replace",
        item: {
          ...item,
          complete: true,
          result: { content: "complete" },
          isError: false,
        },
      },
    ]);
  });

  it("replaces and disposes the active session subscription", () => {
    const { observer, events } = createHarness();
    const firstManager = createManager();
    const secondManager = createManager();
    const first = createSession(firstManager);
    const second = createSession(secondManager);
    observer.instrumentSessionManager(firstManager);
    observer.instrumentSessionManager(secondManager);

    observer.bindSession(first.session);
    observer.bindSession(second.session);
    expect(first.unsubscribe).toHaveBeenCalledOnce();
    first.emit({ type: "agent_end" });
    second.emit({ type: "agent_end" });
    expect(events).toEqual([{ type: "agent_end" }]);

    observer[Symbol.dispose]();
    expect(second.unsubscribe).toHaveBeenCalledOnce();
    second.emit({ type: "agent_end" });
    expect(events).toEqual([{ type: "agent_end" }]);
  });
});
