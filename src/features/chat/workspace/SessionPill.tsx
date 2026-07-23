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
  const { activeSession, recentSessions, canSwitchSession, switchSession } =
    useWorkspaceSession();
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
  onClose: () => void;
}) {
  const [pendingSessionId, setPendingSessionId] = useState<string>();
  const [error, setError] = useState<string>();
  const rootRef = useRef<HTMLDivElement>(null);
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
        <div className="session-picker__note session-picker__note--error">
          {error}
        </div>
      )}
      {sessions.length > 0 && (
        <ul className="session-picker__list">
          {sessions.map((session) => {
            const isCurrent = session.sessionId === activeSession?.sessionId;
            const isPending = session.sessionId === pendingSessionId;
            return (
              <li className="session-picker__row" key={session.sessionId}>
                <button
                  type="button"
                  className="session-picker__option"
                  aria-current={isCurrent ? "true" : undefined}
                  disabled={
                    isCurrent ||
                    !canSwitchSession ||
                    pendingSessionId !== undefined
                  }
                  onClick={() => void select(session.sessionId)}
                >
                  <span
                    className="session-picker__name"
                    title={formatSessionTitle(session)}
                  >
                    <span
                      className="session-picker__current"
                      aria-hidden="true"
                    >
                      {isCurrent ? "✓" : ""}
                    </span>
                    <span className="session-picker__label">
                      {formatSessionLabel(session)}
                    </span>
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

function formatSessionLabel(session: Readonly<SessionSummary>): string {
  if (session.title) return session.title;
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
