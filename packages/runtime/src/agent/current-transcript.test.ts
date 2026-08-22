import { describe, expect, it } from "vitest";

import { createCurrentTranscript } from "./current-transcript";

describe("CurrentTranscript", () => {
  it("materializes durable items plus idempotent live updates", () => {
    const transcript = createCurrentTranscript({
      items: [{ id: "user-1", kind: "user", text: "Run it" }],
    });
    const assistant = {
      id: "live:assistant:1",
      kind: "assistant" as const,
      text: "",
      complete: false,
    };

    transcript.apply({ type: "transcript_append", item: assistant });
    transcript.apply({
      type: "transcript_partial",
      id: assistant.id,
      text: "Working",
      textOffset: 0,
    });
    transcript.apply({
      type: "transcript_partial",
      id: assistant.id,
      text: "Working",
      textOffset: 0,
    });
    transcript.apply({
      type: "transcript_replace",
      previousId: assistant.id,
      item: {
        id: "assistant-1",
        kind: "assistant",
        text: "Working",
        complete: true,
      },
    });

    expect(transcript.getSnapshot().items).toEqual([
      { id: "user-1", kind: "user", text: "Run it" },
      {
        id: "assistant-1",
        kind: "assistant",
        text: "Working",
        complete: true,
      },
    ]);
  });

  it("retains a running tool and its latest partial result", () => {
    const transcript = createCurrentTranscript({ items: [] });
    const tool = {
      id: "assistant-1:tool:call-1",
      kind: "tool" as const,
      toolCallId: "call-1",
      toolName: "bash",
      cwd: "/workspace",
      args: { command: "sleep 15" },
      complete: false,
    };

    transcript.apply({ type: "transcript_append", item: tool });
    transcript.apply({
      type: "transcript_partial",
      id: tool.id,
      partialResult: { content: "still running" },
    });

    expect(transcript.getSnapshot().items).toEqual([
      {
        ...tool,
        partialResult: { content: "still running" },
      },
    ]);
  });

  it("returns snapshots that cannot mutate the current item list", () => {
    const transcript = createCurrentTranscript({
      items: [{ id: "user-1", kind: "user", text: "hello" }],
    });

    transcript.getSnapshot().items.length = 0;

    expect(transcript.getSnapshot().items).toHaveLength(1);
  });
});
