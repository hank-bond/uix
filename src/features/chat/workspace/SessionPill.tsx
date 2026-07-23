import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type RefObject,
} from "react";

import type { SessionSummary } from "@uix/api/agent-channels";
import { useWorkspaceSession } from "@uix/api/workspace";

export function SessionPill() {
  const {
    activeSession,
    recentSessions,
    canSwitchSession,
    switchSession,
    setSessionTitle,
  } = useWorkspaceSession();
  const [open, setOpen] = useState(false);
  const pillRef = useRef<HTMLDivElement>(null);
  const dialogId = useId();

  const close = useCallback(() => setOpen(false), []);

  return (
    <div className="session-pill" ref={pillRef}>
      <button
        type="button"
        className="status-bar__item session-pill__button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? dialogId : undefined}
        disabled={!canSwitchSession}
        title={activeSession && formatSessionTitle(activeSession)}
        onClick={() => setOpen((current) => !current)}
      >
        <span className="session-pill__label">
          {activeSession
            ? formatSessionLabel(activeSession)
            : "loading conversation…"}
        </span>
        <span className="session-pill__chevron" aria-hidden="true">
          ▾
        </span>
      </button>
      {open && (
        <SessionPicker
          id={dialogId}
          pillRef={pillRef}
          activeSession={activeSession}
          recentSessions={recentSessions}
          canSwitchSession={canSwitchSession}
          switchSession={switchSession}
          setSessionTitle={setSessionTitle}
          onClose={close}
        />
      )}
    </div>
  );
}

function SessionPicker({
  id,
  pillRef,
  activeSession,
  recentSessions,
  canSwitchSession,
  switchSession,
  setSessionTitle,
  onClose,
}: {
  id: string;
  pillRef: RefObject<HTMLDivElement>;
  activeSession: Readonly<SessionSummary> | undefined;
  recentSessions: readonly Readonly<SessionSummary>[] | undefined;
  canSwitchSession: boolean;
  switchSession: (
    sessionId: string,
  ) => Promise<Readonly<SessionSummary> | undefined>;
  setSessionTitle: (
    sessionId: string,
    title: string | null,
  ) => Promise<Readonly<SessionSummary> | undefined>;
  onClose: () => void;
}) {
  const [pendingSessionId, setPendingSessionId] = useState<string>();
  const [editingSessionId, setEditingSessionId] = useState<string>();
  const [pendingTitleSessionId, setPendingTitleSessionId] = useState<string>();
  const [draftTitle, setDraftTitle] = useState("");
  const [error, setError] = useState<string>();
  const rootRef = useRef<HTMLDivElement>(null);
  const titleInputRef = useRef<HTMLInputElement>(null);
  const editButtonRefs = useRef(new Map<string, HTMLButtonElement>());
  const focusAfterEditRef = useRef<string>();
  const headingId = useId();
  const sessions = activeSession
    ? [
        activeSession,
        ...(recentSessions ?? []).filter(
          ({ sessionId }) => sessionId !== activeSession.sessionId,
        ),
      ]
    : (recentSessions ?? []);

  useEffect(() => {
    rootRef.current?.focus();
  }, []);

  useEffect(() => {
    if (editingSessionId) {
      titleInputRef.current?.focus();
      titleInputRef.current?.select();
      return;
    }
    const sessionId = focusAfterEditRef.current;
    if (!sessionId) return;
    focusAfterEditRef.current = undefined;
    editButtonRefs.current.get(sessionId)?.focus();
  }, [editingSessionId]);

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      if (!pillRef.current?.contains(event.target as Node)) onClose();
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [onClose, pillRef]);

  const select = async (sessionId: string) => {
    setError(undefined);
    setPendingSessionId(sessionId);
    try {
      const selected = await switchSession(sessionId);
      if (selected) onClose();
      else setError("Session switching is currently unavailable.");
    } catch (selectError) {
      setError(String(selectError));
    } finally {
      setPendingSessionId(undefined);
    }
  };

  const editTitle = (session: Readonly<SessionSummary>) => {
    setError(undefined);
    setDraftTitle(session.title ?? "");
    setEditingSessionId(session.sessionId);
  };

  const cancelTitleEdit = () => {
    focusAfterEditRef.current = editingSessionId;
    setEditingSessionId(undefined);
    setDraftTitle("");
    setError(undefined);
  };

  const saveTitle = async (session: Readonly<SessionSummary>) => {
    const title = draftTitle.trim() || null;
    if (title === (session.title ?? null)) {
      cancelTitleEdit();
      return;
    }

    setError(undefined);
    setPendingTitleSessionId(session.sessionId);
    try {
      const updated = await setSessionTitle(session.sessionId, title);
      if (updated) cancelTitleEdit();
      else setError("Session title changes are currently unavailable.");
    } catch (titleError) {
      setError(String(titleError));
    } finally {
      setPendingTitleSessionId(undefined);
    }
  };

  return (
    <div
      id={id}
      className="session-picker"
      ref={rootRef}
      role="dialog"
      aria-labelledby={headingId}
      tabIndex={-1}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.stopPropagation();
          onClose();
        }
      }}
    >
      <div className="session-picker__header" id={headingId}>
        Recent conversations
      </div>
      {error && (
        <div
          className="session-picker__note session-picker__note--error"
          role="alert"
        >
          {error}
        </div>
      )}
      {sessions.length > 0 && (
        <ul className="session-picker__list">
          {sessions.map((session) => {
            const isCurrent = session.sessionId === activeSession?.sessionId;
            const isPending = session.sessionId === pendingSessionId;
            const isEditing = session.sessionId === editingSessionId;
            const isTitlePending = session.sessionId === pendingTitleSessionId;
            const label = formatSessionLabel(session);
            return (
              <li
                className="session-picker__row"
                data-editing={isEditing ? "true" : undefined}
                key={session.sessionId}
              >
                {isEditing ? (
                  <div className="session-picker__editor">
                    <SelectionMarker selected={isCurrent} />
                    <input
                      ref={titleInputRef}
                      className="session-picker__title-input"
                      aria-label={`Title for ${label}`}
                      placeholder={formatAutomaticSessionLabel(session)}
                      value={draftTitle}
                      disabled={isTitlePending}
                      onChange={(event) => setDraftTitle(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" && canSwitchSession) {
                          event.preventDefault();
                          void saveTitle(session);
                        }
                        if (event.key === "Escape") {
                          event.preventDefault();
                          event.stopPropagation();
                          cancelTitleEdit();
                        }
                      }}
                    />
                    <button
                      type="button"
                      className="session-picker__save-title"
                      aria-live="polite"
                      disabled={!canSwitchSession || isTitlePending}
                      onClick={() => void saveTitle(session)}
                    >
                      {isTitlePending ? "saving…" : "Save"}
                    </button>
                    <button
                      type="button"
                      className="session-picker__cancel-title"
                      aria-label={`Cancel editing title for ${label}`}
                      title="Cancel"
                      disabled={isTitlePending}
                      onClick={cancelTitleEdit}
                    >
                      <span aria-hidden="true">×</span>
                    </button>
                  </div>
                ) : (
                  <>
                    <button
                      type="button"
                      className="session-picker__option"
                      aria-current={isCurrent ? "true" : undefined}
                      disabled={
                        isCurrent ||
                        !canSwitchSession ||
                        pendingSessionId !== undefined ||
                        editingSessionId !== undefined
                      }
                      onClick={() => void select(session.sessionId)}
                    >
                      <span
                        className="session-picker__name"
                        title={formatSessionTitle(session)}
                      >
                        <SelectionMarker selected={isCurrent} />
                        <span className="session-picker__label">{label}</span>
                        {isCurrent && (
                          <span className="visually-hidden">
                            , current conversation
                          </span>
                        )}
                      </span>
                      <time
                        className="session-picker__modified"
                        dateTime={session.modifiedAt}
                        title={formatSessionModifiedTitle(session.modifiedAt)}
                      >
                        {isPending
                          ? "switching…"
                          : formatSessionModifiedAge(session.modifiedAt)}
                      </time>
                    </button>
                    <button
                      type="button"
                      ref={(button) => {
                        if (button)
                          editButtonRefs.current.set(session.sessionId, button);
                        else editButtonRefs.current.delete(session.sessionId);
                      }}
                      className="session-picker__edit-title"
                      aria-label={`Edit title for ${label}`}
                      title="Edit title"
                      disabled={
                        !canSwitchSession ||
                        pendingSessionId !== undefined ||
                        editingSessionId !== undefined
                      }
                      onClick={() => editTitle(session)}
                    >
                      <PencilIcon />
                    </button>
                  </>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {recentSessions === undefined ? (
        <div className="session-picker__note">loading conversations…</div>
      ) : sessions.length === 0 ? (
        <div className="session-picker__note">no conversations</div>
      ) : null}
    </div>
  );
}

function SelectionMarker({ selected }: { selected: boolean }) {
  return (
    <span
      className="session-picker__selection"
      data-selected={selected ? "true" : undefined}
      aria-hidden="true"
    >
      {selected ? "●" : "○"}
    </span>
  );
}

function PencilIcon() {
  return (
    <svg
      className="session-picker__pencil"
      viewBox="0 0 16 16"
      aria-hidden="true"
    >
      <path d="m10.9 2.1 3 3L5.2 13.8l-3.5.5.5-3.5z" />
      <path d="m9.8 3.2 3 3" />
    </svg>
  );
}

function formatSessionLabel(session: Readonly<SessionSummary>): string {
  return session.title ?? formatAutomaticSessionLabel(session);
}

function formatAutomaticSessionLabel(
  session: Readonly<SessionSummary>,
): string {
  const preview = session.firstUserMessage?.preview.replace(/\s+/g, " ").trim();
  if (!preview) return "New conversation";
  return session.firstUserMessage?.truncated ? `${preview}…` : preview;
}

function formatSessionTitle(session: Readonly<SessionSummary>): string {
  if (session.title) return session.title;
  const preview = session.firstUserMessage?.preview;
  if (!preview) return "New conversation";
  return session.firstUserMessage?.truncated ? `${preview}…` : preview;
}

function formatSessionModifiedAge(
  modifiedAt: string,
  now = Date.now(),
): string {
  const timestamp = Date.parse(modifiedAt);
  if (!Number.isFinite(timestamp)) return "";
  const elapsedMinutes = Math.floor(Math.max(0, now - timestamp) / 60_000);
  if (elapsedMinutes < 1) return "now";
  if (elapsedMinutes < 60) return `${elapsedMinutes}m`;
  const elapsedHours = Math.floor(elapsedMinutes / 60);
  if (elapsedHours < 24) return `${elapsedHours}h`;
  const elapsedDays = Math.floor(elapsedHours / 24);
  if (elapsedDays < 7) return `${elapsedDays}d`;
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    ...(new Date(timestamp).getFullYear() === new Date(now).getFullYear()
      ? {}
      : { year: "numeric" as const }),
  }).format(timestamp);
}

function formatSessionModifiedTitle(modifiedAt: string): string | undefined {
  const timestamp = Date.parse(modifiedAt);
  if (!Number.isFinite(timestamp)) return undefined;
  return `Modified ${new Date(timestamp).toLocaleString()}`;
}
