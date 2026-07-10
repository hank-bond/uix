// agent channel contract.
//
// The substrate-owned agent channels (prompt/history/event stream) and the
// transcript item shapes they carry. This lives behind @uix/api because
// feature code binds it — chat is an ordinary feature whose surface renders
// the same agent connection any other feature could use. The backend merges
// handlers via `withHandlers` in the composition root; frontends derive a
// typed client via `createChannelClient`.

import { Type, type Static } from "typebox";

import type { ChannelContract } from "./channels";

/** Schema for the `prompt` request payload. */
export const PromptRequestSchema = Type.Object({
  text: Type.String(),
});
export type PromptRequest = Static<typeof PromptRequestSchema>;

/**
 * Durable transcript items rendered by conversation surfaces. Live events may
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

/** Provider-qualified model reference. */
export const ModelRefSchema = Type.Object({
  provider: Type.String(),
  id: Type.String(),
});
export type ModelRef = Static<typeof ModelRefSchema>;

/** A selectable model: a ref plus its display name. */
export const ModelOptionSchema = Type.Object({
  provider: Type.String(),
  id: Type.String(),
  name: Type.String(),
});
export type ModelOption = Static<typeof ModelOptionSchema>;

/**
 * Model status shown by agent controls. `model` is the live session model —
 * absent until a session exists, and absent even then when pi resolved no
 * model (e.g. no provider is authenticated). `defaultModel` is the workspace
 * default — absent until the pilot first selects one. Both absent means
 * "no model chosen": the UI renders that state rather than inventing a
 * fallback.
 */
export const AgentStatusSchema = Type.Object({
  model: Type.Optional(ModelRefSchema),
  defaultModel: Type.Optional(ModelRefSchema),
});
export type AgentStatus = Static<typeof AgentStatusSchema>;

export const ModelListSchema = Type.Object({
  models: Type.Array(ModelOptionSchema),
});
export type ModelList = Static<typeof ModelListSchema>;

// Agent channel contract — the single source of truth for substrate agent
// channels. `Type.Unsafe` is used for the complex union types (`AgentEvent`,
// `TranscriptSnapshot`) whose full TypeBox encoding would be
// disproportionate — the runtime types are already validated by the driver
// that produces them.
export const AgentEventSchema = Type.Unsafe<AgentEvent>(Type.Any());
export const TranscriptSnapshotSchema = Type.Unsafe<TranscriptSnapshot>(
  Type.Any(),
);

export const agentChannels = {
  feature: "agent",
  requests: {
    prompt: {
      requestSchema: PromptRequestSchema,
      responseSchema: Type.Void(),
    },
    history: {
      requestSchema: Type.Void(),
      responseSchema: TranscriptSnapshotSchema,
    },
    /** Available (auth-configured) models only. */
    list_models: {
      requestSchema: Type.Void(),
      responseSchema: ModelListSchema,
    },
    agent_status: {
      requestSchema: Type.Void(),
      responseSchema: AgentStatusSchema,
    },
    /**
     * Validated against pi's available models; persists the workspace
     * default and switches the live session when one exists.
     */
    select_model: {
      requestSchema: ModelRefSchema,
      responseSchema: AgentStatusSchema,
    },
  },
  events: {
    event: {
      event: AgentEventSchema,
    },
    status_changed: {
      event: AgentStatusSchema,
    },
  },
} as const satisfies ChannelContract;
