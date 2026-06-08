// UIX cockpit — conversation pane.
//
// Two input shapes feed the transcript. Live `AgentEvent`s stream the *current*
// turn: user prompts, assistant text deltas, tool execution rows, and errors.
// A startup history pull seeds *prior* turns whole — already-finished messages,
// no deltas to replay.

import { useEffect, useRef, useState, type FormEvent } from "react";

import type { AgentEvent, HistoryMessage } from "../shared/ipc";

type Message =
  | { id: number; role: "user"; text: string }
  | { id: number; role: "assistant"; text: string; done: boolean }
  | {
      id: number;
      role: "tool";
      toolCallId: string;
      toolName: string;
      text: string;
      done: boolean;
      isError?: boolean;
    }
  | { id: number; role: "error"; text: string };

let nextId = 1;

export function Conversation() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    return window.uix.onAgentEvent((event: AgentEvent) => {
      setMessages((prev) => reduce(prev, event));
      if (event.type === "assistant_end" || event.type === "error") {
        setPending(false);
      }
    });
  }, []);

  // Pull the prior transcript once and prepend it. Prepend (not replace) so any
  // live event that arrived during the await stays after the resumed history.
  // In React StrictMode the first effect setup is immediately cleaned up and
  // re-run; let the second setup issue its own request so hydration can finish.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const snapshot = await window.uix.getHistory();
        if (cancelled) return;
        setMessages((prev) => [
          ...snapshot.messages.map(historyToMessage),
          ...prev,
        ]);
      } finally {
        if (!cancelled) setHydrated(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const text = draft.trim();
    if (!text || pending) return;
    setDraft("");
    setPending(true);
    try {
      await window.uix.sendPrompt({ text });
    } catch (err) {
      setPending(false);
      setMessages((prev) => [
        ...prev,
        { id: nextId++, role: "error", text: String(err) },
      ]);
    }
  };

  return (
    <>
      <div className="conversation__scroll" ref={scrollRef}>
        {messages.length === 0 ? (
          <div className="pane__body--placeholder">
            {hydrated
              ? "send a prompt — main echoes it back"
              : "loading transcript…"}
          </div>
        ) : (
          messages.map((m) => (
            <div key={m.id} className={`msg msg--${messageClass(m)}`}>
              <div className="msg__role">{messageLabel(m)}</div>
              <div className="msg__text">
                {m.text || (m.role === "assistant" ? "…" : "")}
              </div>
            </div>
          ))
        )}
      </div>
      <form
        className="composer"
        onSubmit={(e) => {
          void onSubmit(e);
        }}
      >
        <textarea
          className="composer__input"
          placeholder="say something…"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void onSubmit(e);
            }
          }}
          rows={2}
        />
        <button
          className="composer__send"
          type="submit"
          disabled={pending || !draft.trim()}
        >
          {pending ? "…" : "send"}
        </button>
      </form>
    </>
  );
}

// A resumed entry is already complete: assistant text is final (done), never a
// streaming delta. This is the seed path; reduce() below is the live path.
function historyToMessage(message: HistoryMessage): Message {
  return message.role === "user"
    ? { id: nextId++, role: "user", text: message.text }
    : { id: nextId++, role: "assistant", text: message.text, done: true };
}

function reduce(prev: Message[], event: AgentEvent): Message[] {
  switch (event.type) {
    case "user_message":
      return [...prev, { id: nextId++, role: "user", text: event.text }];

    case "assistant_delta": {
      const last = prev[prev.length - 1];
      if (last && last.role === "assistant" && !last.done) {
        const updated: Message = { ...last, text: last.text + event.delta };
        return [...prev.slice(0, -1), updated];
      }
      return [
        ...prev,
        { id: nextId++, role: "assistant", text: event.delta, done: false },
      ];
    }

    case "assistant_end": {
      const last = prev[prev.length - 1];
      if (last && last.role === "assistant" && !last.done) {
        const updated: Message = { ...last, done: true };
        return [...prev.slice(0, -1), updated];
      }
      return prev;
    }

    case "tool_start":
      return [
        ...prev,
        {
          id: nextId++,
          role: "tool",
          toolCallId: event.toolCallId,
          toolName: event.toolName,
          text: toolText("running", event.toolName, event.args),
          done: false,
        },
      ];

    case "tool_update":
      return updateTool(prev, event.toolCallId, (tool) => ({
        ...tool,
        text: toolText("running", event.toolName, event.partialResult),
      }));

    case "tool_end":
      return updateTool(prev, event.toolCallId, (tool) => ({
        ...tool,
        toolName: event.toolName,
        text: toolText(
          event.isError ? "failed" : "finished",
          event.toolName,
          event.result,
        ),
        done: true,
        isError: event.isError,
      }));

    case "agent_start":
    case "turn_start":
    case "turn_end":
    case "message_start":
    case "message_end":
      return prev;

    case "error":
      return [...prev, { id: nextId++, role: "error", text: event.message }];
  }
}

function updateTool(
  messages: Message[],
  toolCallId: string,
  update: (tool: Extract<Message, { role: "tool" }>) => Message,
): Message[] {
  const index = messages.findIndex(
    (message) => message.role === "tool" && message.toolCallId === toolCallId,
  );
  if (index === -1) return messages;
  return [
    ...messages.slice(0, index),
    update(messages[index] as Extract<Message, { role: "tool" }>),
    ...messages.slice(index + 1),
  ];
}

function toolText(status: string, toolName: string, value: unknown): string {
  const summary = summarize(value);
  return summary
    ? `${status} ${toolName}\n${summary}`
    : `${status} ${toolName}`;
}

function summarize(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  const text =
    typeof value === "string" ? value : JSON.stringify(value, undefined, 2);
  if (!text) return undefined;
  return text.length > 600 ? `${text.slice(0, 600)}…` : text;
}

function messageClass(message: Message): string {
  if (message.role === "tool" && message.isError) return "tool-error";
  return message.role;
}

function messageLabel(message: Message): string {
  if (message.role === "tool" && message.isError) return "tool error";
  return message.role;
}
