// shared IPC contract.
//
// Substrate-owned channels are scoped under `uix:` so they don't collide with
// feature channels or other transport messages. Renderer never imports
// `electron`; it only sees the surface exposed by the preload via
// contextBridge. These types describe that contract so both sides stay
// in sync.

import { Type, type Static } from "typebox";
import type { ChannelContract } from "@uix/api/channels";

/** Substrate channel names. Keep this list small — features register their own. */
export const Channels = {
  /** Renderer → main. invoke-style. Reloads cockpit resources in place. */
  reload: "uix:reload",
} as const;

/** Schema for the `prompt` request payload. */
export const PromptRequestSchema = Type.Object({
  text: Type.String(),
});
export type PromptRequest = Static<typeof PromptRequestSchema>;

export interface ReloadResult {
  featuresLoaded: number;
  featuresFailed: number;
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

// Agent channel contract — the single source of truth for substrate agent
// channels. The backend merges handlers via `withHandlers`; the frontend
// derives a typed client via `createChannelClient`. `Type.Unsafe` is used for
// the complex union types (`AgentEvent`, `TranscriptSnapshot`) whose full
// TypeBox encoding would be disproportionate — the runtime types are already
// validated by the driver that produces them.
export const AgentEventSchema = Type.Unsafe<AgentEvent>(Type.Any());
export const TranscriptSnapshotSchema = Type.Unsafe<TranscriptSnapshot>(
  Type.Any(),
);

export const agentChannels = {
  requests: {
    prompt: {
      requestSchema: PromptRequestSchema,
      responseSchema: Type.Void(),
    },
    history: {
      requestSchema: Type.Void(),
      responseSchema: TranscriptSnapshotSchema,
    },
  },
  events: {
    event: {
      event: AgentEventSchema,
    },
  },
} as const satisfies ChannelContract;

/** Shape exposed on `window.uix` by the preload. */
export interface ChannelTransport {
  /** Generic request/response over IPC. Channel name is the transport address. */
  request(name: string, payload: unknown): Promise<unknown>;
  /** Generic event subscription over IPC. Returns an unsubscribe function. */
  subscribe(name: string, handler: (payload: unknown) => void): () => void;
  /** Programmatic hook for future command palette/menu/chat /reload. */
  reload: () => Promise<ReloadResult>;
}
