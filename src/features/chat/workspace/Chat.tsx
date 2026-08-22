// Renders chat transcripts, prompt submission and cancellation, status controls, and provider login.
//
// One transcript item shape feeds the surface. The current Agent-instance
// snapshot seeds durable and in-flight items. Live events continue that stream
// with idempotent partial updates and whole-item completion replacements.

import type { JSX } from "react";
import {
  type FormEvent,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

import type { AgentEvent, TranscriptItem } from "@uix/api/agent-channels";
import type { agentChannels } from "@uix/api/agent-channels";
import {
  type ChannelClient,
  useFeatureSetting,
  useWorkspaceSession,
} from "@uix/api/workspace";

import { type AgentControls, useAgentControls } from "./agent-controls";
import { BlockPresentationSettingsProvider } from "./blocks/BlockPresentationSettings";
import { ChatBlock } from "./blocks/ChatBlock";
import { ToolCatalogProvider } from "./blocks/tool/tool-catalog";
import {
  deriveComposerKeyboardIntent,
  deriveComposerPresentation,
} from "./composer";
import { ModelPill } from "./ModelPill";
import { pendingUserId } from "./pending";
import { ProviderLoginModal } from "./ProviderLoginModal";
import { SessionPill } from "./SessionPill";
import {
  hydrateChatAgentState,
  reduceChatAgentState,
} from "./transcript-state";
import { chatSettings } from "../shared/settings";

type AgentChannelClient = ChannelClient<typeof agentChannels>;

export interface ChatProps {
  client: AgentChannelClient;
}

export function Chat({ client }: ChatProps): JSX.Element {
  const [agentState, setAgentState] = useState({
    items: [] as TranscriptItem[],
    turnActive: false,
  });
  const [draft, setDraft] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isStopping, setIsStopping] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const activeHistoryRequestVersion = useRef(0);
  const bufferedHistoryEvents = useRef<AgentEvent[] | undefined>([]);
  const { sessionSelectionVersion, loadActiveHistory } = useWorkspaceSession();
  const statusBar = useFeatureSetting(chatSettings, "statusBar");
  const controls = useAgentControls(client);
  const { items, turnActive: isTurnActive } = agentState;
  const canStop = isSubmitting || isTurnActive;
  const composer = deriveComposerPresentation({
    canStop,
    isStopping,
    hasDraft: draft.trim().length > 0,
  });

  useLayoutEffect(() => {
    return client.events.event((event: AgentEvent) => {
      const buffered = bufferedHistoryEvents.current;
      if (buffered) buffered.push(event);
      else setAgentState((prev) => reduceChatAgentState(prev, event));
      if (event.type === "active_turn_start") setIsSubmitting(false);
      if (event.type === "active_turn_end") {
        setIsSubmitting(false);
        setIsStopping(false);
      }
    });
  }, [client]);

  // A successful session mutation changes sessionSelectionVersion. Clear the
  // old projection immediately, invalidate its in-flight history read, and
  // hydrate the newly selected session. Events continue into a short-lived
  // buffer until the current Agent-instance snapshot is installed.
  useLayoutEffect(() => {
    const requestVersion = ++activeHistoryRequestVersion.current;
    bufferedHistoryEvents.current = [];
    setAgentState({ items: [], turnActive: false });
    setIsSubmitting(false);
    setIsStopping(false);
    setHydrated(false);
    void (async () => {
      try {
        const snapshot = await loadActiveHistory();
        if (requestVersion !== activeHistoryRequestVersion.current) return;
        const buffered = bufferedHistoryEvents.current ?? [];
        bufferedHistoryEvents.current = undefined;
        setAgentState((prev) =>
          hydrateChatAgentState(snapshot, prev, buffered),
        );
      } catch {
        if (requestVersion !== activeHistoryRequestVersion.current) return;
        const buffered = bufferedHistoryEvents.current ?? [];
        bufferedHistoryEvents.current = undefined;
        setAgentState((prev) =>
          hydrateChatAgentState(
            { transcript: { items: [] }, turnActive: false },
            prev,
            buffered,
          ),
        );
      } finally {
        if (requestVersion === activeHistoryRequestVersion.current) {
          setHydrated(true);
        }
      }
    })();
    return () => {
      if (activeHistoryRequestVersion.current === requestVersion) {
        activeHistoryRequestVersion.current += 1;
      }
    };
  }, [sessionSelectionVersion, loadActiveHistory]);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [items]);

  const cancelTurn = async (): Promise<void> => {
    if (!canStop || isStopping) return;
    setIsStopping(true);
    try {
      const { cancelled } = await client.requests.cancel_turn();
      if (!cancelled) setIsStopping(false);
      setIsSubmitting(false);
    } catch (err) {
      setIsStopping(false);
      setAgentState((prev) => ({
        ...prev,
        items: [
          ...prev.items,
          {
            id: `local:error:${String(Date.now())}`,
            kind: "error",
            message: String(err),
          },
        ],
      }));
    }
  };

  const onSubmit = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    const text = draft.trim();
    if (!text || canStop || isStopping) return;
    setDraft("");
    setIsSubmitting(true);
    // Optimistic echo: show the message instantly as an unconfirmed pending
    // row. Main emits the authoritative born-keyed row once Pi persists it,
    // and the reducer swaps this row out (eventual consistency: display
    // first, confirm via the canonical record).
    setAgentState((prev) => ({
      ...prev,
      items: [...prev.items, { id: pendingUserId(), kind: "user", text }],
    }));
    try {
      await client.requests.prompt({ text });
    } catch (err) {
      setIsSubmitting(false);
      setAgentState((prev) => ({
        ...prev,
        items: [
          ...prev.items,
          {
            id: `local:error:${String(Date.now())}`,
            kind: "error",
            message: String(err),
          },
        ],
      }));
    }
  };

  return (
    <ToolCatalogProvider client={client}>
      <div className="chat__scroll" ref={scrollRef}>
        <BlockPresentationSettingsProvider>
          {items.length === 0 ? (
            <div className="surface-panel__body--placeholder">
              {hydrated
                ? "send a prompt; main echoes it back"
                : "loading transcript…"}
            </div>
          ) : (
            items.map((item) => <ChatBlock key={item.id} item={item} />)
          )}
        </BlockPresentationSettingsProvider>
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
          onChange={(e) => {
            setDraft(e.target.value);
          }}
          onKeyDown={(e) => {
            const intent = deriveComposerKeyboardIntent({
              key: e.key,
              shiftKey: e.shiftKey,
              canStop,
              isStopping,
            });
            if (!intent) return;
            e.preventDefault();
            if (intent === "cancel") void cancelTurn();
            if (intent === "submit") void onSubmit(e);
          }}
          rows={2}
        />
        <button
          className="composer__send"
          type={composer.action === "cancel" ? "button" : "submit"}
          disabled={composer.disabled}
          onClick={
            composer.action === "cancel" ? () => void cancelTurn() : undefined
          }
        >
          {composer.label}
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
    </ToolCatalogProvider>
  );
}

// The reader ignores unknown cell ids so settings persisted before a cell
// existed, or after one is retired, remain harmless.
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
}): JSX.Element {
  const visible = order.filter((id) => !hidden.includes(id));
  return (
    <div className="status-bar" aria-label="Chat status bar">
      <SessionPill />
      {error ? (
        <span className="status-bar__item status-bar__item--error">
          settings error: {error.message}
        </span>
      ) : (
        !loading &&
        visible.includes("model") && <ModelPill controls={controls} />
      )}
    </div>
  );
}
