// shared IPC contract.
//
// Substrate-owned channels are scoped under `uix:` so they don't collide with
// feature channels or other transport messages. Renderer never imports
// `electron`; it only sees the surface exposed by the preload via
// contextBridge. These types describe that contract so both sides stay
// in sync.

/** Substrate channel names. Keep this list small — features register their own. */
export const Channels = {
  /** Renderer → main. invoke-style. Reloads cockpit resources in place. */
  reload: "uix:reload",
} as const;

/** Payload for `uix:prompt`. */
export interface PromptRequest {
  text: string;
}

export interface ReloadResult {
  extensionsLoaded: number;
  extensionsFailed: number;
  /** True when a pi session already existed and pi's reload path ran. */
  piReloaded: boolean;
}

/**
 * Durable transcript items rendered by the conversation pane. Live events may
 * carry in-flight fields on the same item shape; history replay only returns
 * completed durable items.
 */
export type TranscriptItem =
  | { id: string; kind: "user"; text: string }
  | {
      id: string;
      kind: "assistant";
      text: string;
      complete: boolean;
    }
  | {
      id: string;
      kind: "tool";
      toolCallId: string;
      toolName: string;
      complete: boolean;
      args?: unknown;
      result?: unknown;
      /** Live-only progress payload; discarded when the tool completes. */
      partialResult?: unknown;
      isError?: boolean;
    }
  | {
      id: string;
      kind: "custom";
      customType: string;
      content: unknown;
      details?: unknown;
      display: boolean;
    }
  | { id: string; kind: "error"; message: string };

export type AgentEvent =
  | { type: "transcript_append"; item: TranscriptItem }
  | {
      type: "transcript_replace";
      item: TranscriptItem;
      /**
       * Set when the row was rekeyed: the pre-key transport handle the item
       * was previously delivered under. The renderer swaps the id in place
       * (position preserved). See
       * docs/decisions/2026-06-09-transcript-keyed-on-persist.md.
       */
      previousId?: string;
    }
  | {
      /**
       * Compact in-flight update to an already-appended item. The renderer is
       * the accumulator: `text` appends to a streaming assistant row's text;
       * `partialResult` overwrites a tool row's live progress payload (pi
       * tool updates are replacement snapshots, not increments). A full
       * `transcript_replace` still lands at completion, so partials are pure
       * display traffic — dropping one loses nothing durable.
       */
      type: "transcript_partial";
      id: string;
      text?: string;
      partialResult?: unknown;
    }
  | { type: "agent_start" }
  | { type: "agent_end" }
  | { type: "turn_start" }
  | { type: "turn_end" };

/** Complete, durable transcript items replayed from the persisted session. */
export interface TranscriptSnapshot {
  items: TranscriptItem[];
}

/** Shape exposed on `window.uix` by the preload. */
export interface UIXBridge {
  /** Generic request/response over IPC. Channel name is the transport address. */
  request(name: string, payload: unknown): Promise<unknown>;
  /** Generic event subscription over IPC. Returns an unsubscribe function. */
  subscribe(name: string, handler: (payload: unknown) => void): () => void;
  /** Programmatic hook for future command palette/menu/chat /reload. */
  reload: () => Promise<ReloadResult>;
}
