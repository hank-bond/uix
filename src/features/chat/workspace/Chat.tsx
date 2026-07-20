// chat surface.
//
// One transcript item shape feeds the surface. Startup history supplies completed
// durable items; live events append the same items, stream compact partials
// into them, and replace them whole at completion.

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";

import type { AgentEvent, TranscriptItem } from "@uix/api/agent-channels";
import {
  useActiveSession,
  useFeatureSetting,
  type ChannelClient,
} from "@uix/api/workspace";
import type { agentChannels } from "@uix/api/agent-channels";
import { useAgentControls, type AgentControls } from "./agent-controls";
import { ChatBlock } from "./blocks/ChatBlock";
import { ModelPill } from "./ModelPill";
import { isPendingUserId, pendingUserId } from "./pending";
import { ProviderLoginModal } from "./ProviderLoginModal";
import { chatSettings } from "../shared/settings";

type AgentChannelClient = ChannelClient<typeof agentChannels>;

export interface ChatProps {
  client: AgentChannelClient;
}

export function Chat({ client }: ChatProps) {
  const [items, setItems] = useState<TranscriptItem[]>([]);
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const historyLoadVersion = useRef(0);
  const activeSession = useActiveSession();
  const activeSessionId = activeSession?.sessionId;
  const statusBar = useFeatureSetting(chatSettings, "statusBar");
  const controls = useAgentControls(client);

  useEffect(() => {
    return client.events.event((event: AgentEvent) => {
      setItems((prev) => reduce(prev, event));
      if (event.type === "agent_end") {
        setPending(false);
      }
    });
  }, [client]);

  // A successful session mutation changes activeSessionId. Clear the old
  // projection immediately, invalidate its in-flight history read, and hydrate
  // the newly selected session. Prepend so live events received during the
  // request remain after the durable history.
  useLayoutEffect(() => {
    const loadVersion = ++historyLoadVersion.current;
    setItems([]);
    setHydrated(false);
    void (async () => {
      try {
        const snapshot = await client.requests.history(undefined);
        if (loadVersion !== historyLoadVersion.current) return;
        setItems((prev) => [...snapshot.items.filter(isVisible), ...prev]);
      } finally {
        if (loadVersion === historyLoadVersion.current) setHydrated(true);
      }
    })();
    return () => {
      if (historyLoadVersion.current === loadVersion) {
        historyLoadVersion.current += 1;
      }
    };
  }, [client, activeSessionId]);

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
      await client.requests.prompt({ text });
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
          <div className="surface-panel__body--placeholder">
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
      <StatusBar
        controls={controls}
        order={statusBar.value?.order ?? []}
        hidden={statusBar.value?.hidden ?? []}
        loading={statusBar.loading}
        error={statusBar.error}
      />
      <ProviderLoginModal controls={controls} />
    </>
  );
}

// Unknown cell ids are ignored so settings persisted before a cell existed,
// or after one is retired, remain harmless.
function StatusBar({
  controls,
  order,
  hidden,
  loading,
  error,
}: {
  controls: AgentControls;
  order: readonly string[];
  hidden: readonly string[];
  loading: boolean;
  error: Error | undefined;
}) {
  const visible = order.filter((id) => !hidden.includes(id));
  return (
    <div className="status-bar" aria-label="Chat status bar">
      {error ? (
        <span className="status-bar__item status-bar__item--error">
          settings error: {error.message}
        </span>
      ) : loading ? null : (
        visible.includes("model") && <ModelPill controls={controls} />
      )}
    </div>
  );
}

function reduce(prev: TranscriptItem[], event: AgentEvent): TranscriptItem[] {
  switch (event.type) {
    case "transcript_append":
      return isVisible(event.item) ? appendItem(prev, event.item) : prev;

    case "transcript_replace":
      return syncItem(prev, event.item, event.previousId);

    case "transcript_partial":
      return applyPartial(prev, event);

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
  let index = lastIndexById(items, item.id);
  if (index === -1 && previousId !== undefined) {
    index = lastIndexById(items, previousId);
  }

  if (!isVisible(item)) {
    return index === -1
      ? items
      : [...items.slice(0, index), ...items.slice(index + 1)];
  }
  if (index === -1) {
    // eslint-disable-next-line no-console -- ordering-broke diagnostic; the renderer has no logger facility
    console.warn("transcript_replace inserted a net-new item", item.id);
    return [...items, item];
  }
  return [...items.slice(0, index), item, ...items.slice(index + 1)];
}

// Merge an in-flight partial into its row: streamed text appends (the
// renderer is the accumulator), a tool's partialResult overwrites (pi tool
// updates are replacement snapshots). The append always precedes its
// partials and a full replace lands at completion, so an unmatched partial
// means ordering broke — warn and drop; nothing durable is lost.
function applyPartial(
  items: TranscriptItem[],
  event: Extract<AgentEvent, { type: "transcript_partial" }>,
): TranscriptItem[] {
  const index = lastIndexById(items, event.id);
  if (index === -1) {
    // eslint-disable-next-line no-console -- ordering-broke diagnostic; the renderer has no logger facility
    console.warn("transcript_partial for unknown item", event.id);
    return items;
  }
  const item = items[index];
  let next: TranscriptItem;
  if (item.kind === "assistant" && event.text !== undefined) {
    next = { ...item, text: item.text + event.text };
  } else if (item.kind === "tool") {
    next = { ...item, partialResult: event.partialResult };
  } else {
    return items;
  }
  return [...items.slice(0, index), next, ...items.slice(index + 1)];
}

// Ids are unique, so scan direction is purely a performance choice: live
// updates (per-token partials, completion/rekey replaces) target rows at or
// near the tail, while a front scan walks the whole resumed history first.
// (ES2022 lib, so no Array#findLastIndex.)
function lastIndexById(items: TranscriptItem[], id: string): number {
  for (let i = items.length - 1; i >= 0; i--) {
    if (items[i].id === id) return i;
  }
  return -1;
}

function isVisible(item: TranscriptItem): boolean {
  return item.kind !== "custom" || item.display;
}
