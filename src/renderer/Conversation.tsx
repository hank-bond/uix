// UIX cockpit — conversation pane.
//
// One transcript item shape feeds the pane. Startup history supplies completed
// durable items; live events append or replace the same items while the current
// turn streams.

import { useEffect, useRef, useState, type FormEvent } from "react";

import type { AgentEvent, TranscriptItem } from "../shared/ipc";

export function Conversation() {
  const [items, setItems] = useState<TranscriptItem[]>([]);
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    return window.uix.onAgentEvent((event: AgentEvent) => {
      setItems((prev) => reduce(prev, event));
      if (event.type === "agent_end") {
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
        setItems((prev) => [...snapshot.items.filter(isVisible), ...prev]);
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
  }, [items]);

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
      setItems((prev) => [
        ...prev,
        {
          id: `local:error:${Date.now()}`,
          kind: "error",
          message: String(err),
        },
      ]);
    }
  };

  return (
    <>
      <div className="conversation__scroll" ref={scrollRef}>
        {items.length === 0 ? (
          <div className="pane__body--placeholder">
            {hydrated
              ? "send a prompt — main echoes it back"
              : "loading transcript…"}
          </div>
        ) : (
          items.map((item) => (
            <div key={item.id} className={`msg msg--${messageClass(item)}`}>
              <div className="msg__role">{messageLabel(item)}</div>
              <div className="msg__text">{itemText(item)}</div>
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

function reduce(prev: TranscriptItem[], event: AgentEvent): TranscriptItem[] {
  switch (event.type) {
    case "transcript_append":
      return isVisible(event.item) ? [...prev, event.item] : prev;

    case "transcript_replace":
      return syncItem(prev, event.item);

    case "agent_start":
    case "agent_end":
    case "turn_start":
    case "turn_end":
      return prev;
  }
}

// Reconcile an item's presence in the list to match its visibility: a visible
// item is replaced in place (kept current), an invisible one is removed. The
// driver only replaces ids it already appended, so a net-new insert here means
// a replace outran or lost its append — recover gracefully but warn, since that
// ordering invariant is load-bearing for durable transcript identity.
function syncItem(
  items: TranscriptItem[],
  item: TranscriptItem,
): TranscriptItem[] {
  const index = items.findIndex((existing) => existing.id === item.id);

  if (!isVisible(item)) {
    return index === -1
      ? items
      : [...items.slice(0, index), ...items.slice(index + 1)];
  }
  if (index === -1) {
    console.warn("transcript_replace inserted a net-new item", item.id);
    return [...items, item];
  }
  return [...items.slice(0, index), item, ...items.slice(index + 1)];
}

function isVisible(item: TranscriptItem): boolean {
  return item.kind !== "custom" || item.display;
}

function itemText(item: TranscriptItem): string {
  switch (item.kind) {
    case "user":
    case "assistant":
      return item.text || (item.kind === "assistant" ? "…" : "");
    case "tool":
      return toolText(item);
    case "custom":
      return truncateText(item.content) ?? truncateText(item.details) ?? "";
    case "error":
      return item.message;
  }
}

function toolText(item: Extract<TranscriptItem, { kind: "tool" }>): string {
  const status = !item.complete
    ? "running"
    : item.isError
      ? "failed"
      : "finished";
  const summary = truncateText(
    !item.complete ? (item.partialResult ?? item.args) : item.result,
  );
  return summary
    ? `${status} ${item.toolName}\n${summary}`
    : `${status} ${item.toolName}`;
}

function truncateText(
  value: unknown,
  charLimit: number = 600,
): string | undefined {
  if (value === undefined || value === null) return undefined;
  const text =
    typeof value === "string" ? value : JSON.stringify(value, undefined, 2);
  if (!text) return undefined;
  return text.length > charLimit ? `${text.slice(0, charLimit)}…` : text;
}

function messageClass(item: TranscriptItem): string {
  if (item.kind === "tool" && item.isError) return "tool-error";
  return item.kind;
}

function messageLabel(item: TranscriptItem): string {
  if (item.kind === "tool" && item.isError) return "tool error";
  if (item.kind === "custom") return item.customType;
  return item.kind;
}
