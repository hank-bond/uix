// Mirrors live Pi session events as renderer transcript updates with the same item shape as persisted history.
//
// The observer watches session managers before Pi receives them so transcript rows can
// acquire their durable entry ids at persistence. The active session binding
// then normalizes Pi's live event stream into the same TranscriptItem model
// produced by history projection.

import type {
  AgentSession,
  AgentSessionEvent,
  SessionManager,
} from "@earendil-works/pi-coding-agent";

import type { AgentEvent, TranscriptItem } from "@uix/api/agent-channels";

import { deriveToolFileLocation } from "./tool-file-location";
import {
  type EphemeralTranscriptItemIdSequence,
  extractAssistantError,
  extractTranscriptText,
  getMessageRole,
  parseCustomTranscriptItem,
  toIpcValue,
} from "./transcript";
import {
  createTranscriptItemIdentity,
  type TranscriptItemIdentity,
} from "./transcript-item-identity";
import { DisposableBag, subscribe } from "../lifecycle";

interface TranscriptObserverOptions {
  emit: (event: AgentEvent) => void;
  ephemeralIds: EphemeralTranscriptItemIdSequence;
}

export interface TranscriptObserver extends Disposable {
  /** Observe persistence before Pi receives this manager. Idempotent by manager. */
  instrumentSessionManager(manager: SessionManager): void;
  /** Replace the active Pi event-stream binding. */
  bindSession(session: AgentSession): void;
  /** Remove the active Pi event-stream binding. */
  unbindSession(): void;
}

/** Creates one observer for an agent driver's lifetime. */
export function createTranscriptObserver(
  opts: TranscriptObserverOptions,
): TranscriptObserver {
  const sessionBag = new DisposableBag();
  const identityByManager = new WeakMap<
    SessionManager,
    TranscriptItemIdentity
  >();
  let disposed = false;

  function assertActive(): void {
    if (disposed) throw new Error("Transcript observer is disposed");
  }

  return {
    instrumentSessionManager(manager) {
      assertActive();
      if (identityByManager.has(manager)) return;

      const identity = createTranscriptItemIdentity();
      identity.onUserMessage((durableId, message) => {
        if (disposed) return;
        const text = extractTranscriptText(message);
        if (!text) return;
        opts.emit({
          type: "transcript_append",
          item: { id: durableId, kind: "user", text },
        });
      });
      // Pi persists after message_end and has no post-persist event, so this
      // must wrap the manager before the AgentSession receives it.
      identity.observe(manager);
      identityByManager.set(manager, identity);
    },

    bindSession(session) {
      assertActive();
      const identity = identityByManager.get(session.sessionManager);
      if (!identity) {
        throw new Error(
          "Session manager transcript-item identity is unavailable",
        );
      }

      sessionBag.clear();
      sessionBag.add(
        subscribe<AgentSessionEvent>(
          session,
          createLiveTranscriptForwarder(
            opts.emit,
            identity,
            opts.ephemeralIds,
            session.sessionManager.getCwd(),
          ),
        ),
      );
    },

    unbindSession() {
      sessionBag.clear();
    },

    [Symbol.dispose]() {
      if (disposed) return;
      disposed = true;
      sessionBag[Symbol.dispose]();
    },
  };
}

function createLiveTranscriptForwarder(
  emit: (event: AgentEvent) => void,
  identity: TranscriptItemIdentity,
  ephemeralIds: EphemeralTranscriptItemIdSequence,
  cwd: string,
) {
  let assistant: Extract<TranscriptItem, { kind: "assistant" }> | undefined;
  const tools = new Map<string, Extract<TranscriptItem, { kind: "tool" }>>();

  function append(item: TranscriptItem): void {
    emit({ type: "transcript_append", item });
  }

  function replace(item: TranscriptItem): void {
    emit({ type: "transcript_replace", item });
  }

  function ensureAssistant(): Extract<TranscriptItem, { kind: "assistant" }> {
    if (assistant) return assistant;
    assistant = {
      id: ephemeralIds.next("assistant"),
      kind: "assistant",
      text: "",
      complete: false,
    };
    append(assistant);
    return assistant;
  }

  return (event: AgentSessionEvent): void => {
    switch (event.type) {
      case "agent_start":
        emit({ type: "agent_start" });
        return;

      case "turn_start":
        emit({ type: "turn_start" });
        return;

      case "turn_end":
        emit({ type: "turn_end" });
        return;

      case "message_start":
        if (getMessageRole(event.message) === "assistant") ensureAssistant();
        return;

      case "message_update": {
        const inner = event.assistantMessageEvent;
        if (inner.type === "text_delta") {
          // Accumulate locally (message_end falls back to this text when the
          // final message extracts empty) but ship only the increment. The
          // renderer accumulates its copy from partials.
          const current = ensureAssistant();
          assistant = { ...current, text: current.text + inner.delta };
          emit({
            type: "transcript_partial",
            id: current.id,
            text: inner.delta,
          });
        }
        return;
      }

      case "message_end": {
        const role = getMessageRole(event.message);
        if (role === "assistant") {
          const current = ensureAssistant();
          const error = extractAssistantError(event.message);
          const final: TranscriptItem = error
            ? { id: current.id, kind: "error", message: error }
            : {
                ...current,
                text: extractTranscriptText(event.message) || current.text,
                complete: true,
              };
          // Final content lands under the pre-key handle first, so display
          // never depends on the append wrapper. The rekey replace follows
          // in the same tick when Pi persists this exact message object.
          replace(final);
          assistant = undefined;
          identity.expectMessageKey(event.message, (durableId) => {
            emit({
              type: "transcript_replace",
              item: { ...final, id: durableId },
              previousId: final.id,
            });
          });
          return;
        }

        // Displayed custom messages don't stream, so hold the row one tick
        // and append it already keyed when Pi persists the entry (pi never
        // hands the manager the CustomMessage object, so there is no handle
        // path to correlate a rekey through).
        const custom = parseCustomTranscriptItem("pending", event.message);
        if (custom) {
          identity.expectCustomEntry((durableId) => {
            append({ ...custom, id: durableId });
          });
        }
        return;
      }

      case "tool_execution_start": {
        // Born keyed: Pi persisted the assistant message (with this row's
        // toolCall block) before execution started, so the durable replay
        // derivation is already known. The live-id fallback only fires if pi
        // reorders persistence, degrading to a pre-key row.
        const args = toIpcValue(event.args);
        const file = deriveToolFileLocation(event.toolName, args, cwd);
        const item = {
          id: identity.toolRowId(event.toolCallId) ?? ephemeralIds.next("tool"),
          kind: "tool" as const,
          toolCallId: event.toolCallId,
          toolName: event.toolName,
          cwd,
          ...(file && { file }),
          args,
          complete: false,
        };
        tools.set(event.toolCallId, item);
        append(item);
        return;
      }

      case "tool_execution_update": {
        // Tool partials are tool-defined replacement snapshots (e.g. bash
        // ships its bounded output tail every ~100ms), so forward the payload
        // alone. No point resending the row's args on every tick. The stored
        // row stays as appended. The completion replace discards partials.
        const current = tools.get(event.toolCallId);
        if (!current) return;
        emit({
          type: "transcript_partial",
          id: current.id,
          partialResult: toIpcValue(event.partialResult),
        });
        return;
      }

      case "tool_execution_end": {
        const existing = tools.get(event.toolCallId);
        const current =
          existing ??
          ({
            id:
              identity.toolRowId(event.toolCallId) ?? ephemeralIds.next("tool"),
            kind: "tool" as const,
            toolCallId: event.toolCallId,
            toolName: event.toolName,
            cwd,
            complete: false,
          } satisfies Extract<TranscriptItem, { kind: "tool" }>);
        const item: Extract<TranscriptItem, { kind: "tool" }> = {
          id: current.id,
          kind: "tool",
          toolCallId: current.toolCallId,
          toolName: event.toolName,
          cwd: current.cwd,
          ...(current.file && { file: current.file }),
          complete: true,
          args: current.args,
          result: toIpcValue(event.result),
          isError: event.isError,
        };
        tools.delete(event.toolCallId);
        if (existing) replace(item);
        else append(item);
        return;
      }

      case "agent_end":
        emit({ type: "agent_end" });
        return;

      default:
        return;
    }
  };
}
