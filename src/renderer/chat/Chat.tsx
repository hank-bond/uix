// UIX cockpit — chat pane.
//
// One transcript item shape feeds the pane. Startup history supplies completed
// durable items; live events append or replace the same items while the current
// turn streams.

import { useEffect, useRef, useState, type FormEvent } from "react";

import type { AgentEvent, TranscriptItem } from "../../shared/ipc";
import { ChatBlock } from "./blocks/ChatBlock";
import { isPendingUserId, pendingUserId } from "./pending";

export function Chat() {
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
    // Optimistic echo: show the message instantly as an unconfirmed pending
    // row. Main emits the authoritative born-keyed row once pi persists it,
    // and the reducer swaps this row out (eventual consistency — display
    // first, confirm via the canonical record).
    setItems((prev) => [...prev, { id: pendingUserId(), kind: "user", text }]);
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
      <div className="chat__scroll" ref={scrollRef}>
        {items.length === 0 ? (
          <div className="pane__body--placeholder">
            {hydrated
              ? "send a prompt — main echoes it back"
              : "loading transcript…"}
          </div>
        ) : (
          items.map((item) => <ChatBlock key={item.id} item={item} />)
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
      return isVisible(event.item) ? appendItem(prev, event.item) : prev;

    case "transcript_replace":
      return syncItem(prev, event.item, event.previousId);

    case "agent_start":
    case "agent_end":
    case "turn_start":
    case "turn_end":
      return prev;
  }
}

// Append, or confirm an optimistic pending user row in place: main's
// authoritative born-keyed user row replaces the composer's unconfirmed echo.
// Text equality is the match guard so an unrelated user message (e.g.
// extension-injected via sendUserMessage) appends normally instead of
// consuming someone else's pending row; today the persisted user entry is
// the human's text verbatim, so equality holds. If input enrichment ever
// changes the canonical text, relax this to confirm the oldest pending row
// and let the canonical version win.
function appendItem(
  items: TranscriptItem[],
  item: TranscriptItem,
): TranscriptItem[] {
  if (item.kind === "user") {
    const index = items.findIndex(
      (existing) =>
        existing.kind === "user" &&
        isPendingUserId(existing.id) &&
        existing.text === item.text,
    );
    if (index !== -1) {
      return [...items.slice(0, index), item, ...items.slice(index + 1)];
    }
  }
  return [...items, item];
}

// Reconcile an item's presence in the list to match its visibility: a visible
// item is replaced in place (kept current), an invisible one is removed. A
// rekey replace carries previousId (the pre-key transport handle); matching
// the new id first keeps a re-delivered rekey idempotent. The driver only
// replaces ids it already appended, so a net-new insert here means a replace
// outran or lost its append — recover gracefully but warn, since that
// ordering invariant is load-bearing for durable transcript identity.
function syncItem(
  items: TranscriptItem[],
  item: TranscriptItem,
  previousId?: string,
): TranscriptItem[] {
  let index = items.findIndex((existing) => existing.id === item.id);
  if (index === -1 && previousId !== undefined) {
    index = items.findIndex((existing) => existing.id === previousId);
  }

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
