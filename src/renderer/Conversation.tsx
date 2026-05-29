// Trellis cockpit — conversation pane.
//
// Subscribes to `window.trellis.onAgentEvent` and renders the running
// transcript as plain text. Three message kinds today: user prompts,
// assistant text (streamed), and errors. Tool calls and other lifecycle
// events get their own affordances when we need them; for now we just
// want to see text flow.

import { useEffect, useRef, useState, type FormEvent } from "react";

import type { AgentEvent } from "../shared/ipc";

type Message =
  | { id: number; role: "user"; text: string }
  | { id: number; role: "assistant"; text: string; done: boolean }
  | { id: number; role: "error"; text: string };

let nextId = 1;

export function Conversation() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    return window.trellis.onAgentEvent((event: AgentEvent) => {
      setMessages((prev) => reduce(prev, event));
      if (event.type === "assistant_end" || event.type === "error") {
        setPending(false);
      }
    });
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
      await window.trellis.sendPrompt({ text });
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
            send a prompt — main echoes it back
          </div>
        ) : (
          messages.map((m) => (
            <div key={m.id} className={`msg msg--${m.role}`}>
              <div className="msg__role">{m.role}</div>
              <div className="msg__text">{m.text || (m.role === "assistant" ? "…" : "")}</div>
            </div>
          ))
        )}
      </div>
      <form className="composer" onSubmit={onSubmit}>
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
        <button className="composer__send" type="submit" disabled={pending || !draft.trim()}>
          {pending ? "…" : "send"}
        </button>
      </form>
    </>
  );
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

    case "error":
      return [...prev, { id: nextId++, role: "error", text: event.message }];
  }
}
