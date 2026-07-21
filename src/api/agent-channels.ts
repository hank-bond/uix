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
export const TranscriptSnapshotSchema = Type.Unsafe<TranscriptSnapshot>(
  Type.Any(),
);

export const SessionIdSchema = Type.String({
  pattern: "^[A-Za-z0-9](?:[A-Za-z0-9._-]*[A-Za-z0-9])?$",
});

/** Durable identity and current display projection for one session graph. */
export const SessionSummarySchema = Type.Object({
  sessionId: SessionIdSchema,
  displayName: Type.Optional(Type.String()),
  displayLabel: Type.String(),
  createdAt: Type.String(),
  modifiedAt: Type.String(),
});
export type SessionSummary = Static<typeof SessionSummarySchema>;

export const ListSessionSummariesRequestSchema = Type.Object({
  limit: Type.Integer({ minimum: 1 }),
});
export type ListSessionSummariesRequest = Static<
  typeof ListSessionSummariesRequestSchema
>;

const SessionSummaryListSchema = Type.Array(SessionSummarySchema);

export const SessionHistoryRequestSchema = Type.Object({
  sessionId: Type.Optional(SessionIdSchema),
});
export type SessionHistoryRequest = Static<typeof SessionHistoryRequestSchema>;

export const SessionHistoryResponseSchema = Type.Object({
  session: SessionSummarySchema,
  transcript: TranscriptSnapshotSchema,
});
export type SessionHistoryResponse = Static<
  typeof SessionHistoryResponseSchema
>;

/** Provider-qualified model reference. */
export const ModelRefSchema = Type.Object({
  provider: Type.String(),
  id: Type.String(),
});
export type ModelRef = Static<typeof ModelRefSchema>;

/** A selectable model plus its workspace-local favorite status. */
export const ModelCatalogEntrySchema = Type.Object({
  provider: Type.String(),
  id: Type.String(),
  name: Type.String(),
  favorite: Type.Boolean(),
});
export type ModelCatalogEntry = Static<typeof ModelCatalogEntrySchema>;
export type ModelCatalog = readonly ModelCatalogEntry[];

export const ModelCatalogSchema = Type.Unsafe<ModelCatalog>(
  Type.Array(ModelCatalogEntrySchema),
);

export const ModelFavoriteUpdateSchema = Type.Object({
  ...ModelRefSchema.properties,
  favorite: Type.Boolean(),
});
export type ModelFavoriteUpdate = Static<typeof ModelFavoriteUpdateSchema>;

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

const ModelCatalogResponseSchema = Type.Object({
  models: ModelCatalogSchema,
});

const ProviderConnectionSchema = Type.Object({
  source: Type.Union([
    Type.Literal("stored"),
    Type.Literal("environment"),
    Type.Literal("runtime"),
    Type.Literal("configuration"),
  ]),
  credentialReference: Type.Optional(
    Type.Union([
      Type.Object({
        type: Type.Literal("environment"),
        name: Type.String(),
      }),
      Type.Object({
        type: Type.Literal("command"),
        location: Type.Union([
          Type.Literal("auth_file"),
          Type.Literal("provider_configuration"),
        ]),
      }),
    ]),
  ),
  /** Last four characters of a stored literal API key, when safe to expose. */
  keySuffix: Type.Optional(
    Type.String({ minLength: 4, maxLength: 4, pattern: "^[\\x21-\\x7e]{4}$" }),
  ),
});

const ProviderAuthMethodBaseSchema = Type.Object({
  providerId: Type.String(),
  label: Type.String(),
  connection: Type.Optional(ProviderConnectionSchema),
});

export const ProviderAuthMethodSchema = Type.Union([
  Type.Object({
    id: Type.Literal("oauth"),
    type: Type.Literal("oauth"),
    ...ProviderAuthMethodBaseSchema.properties,
    startActions: Type.Array(
      Type.Object({
        id: Type.String(),
        label: Type.String(),
        primary: Type.Boolean(),
      }),
    ),
  }),
  Type.Object({
    id: Type.String(),
    type: Type.Literal("credentials"),
    ...ProviderAuthMethodBaseSchema.properties,
    description: Type.Optional(Type.String()),
    fields: Type.Array(
      Type.Object({
        id: Type.String(),
        label: Type.String(),
        secret: Type.Boolean(),
        required: Type.Boolean(),
        placeholder: Type.Optional(Type.String()),
      }),
    ),
    helpUrl: Type.Optional(Type.String()),
  }),
]);
export type ProviderAuthMethod = Static<typeof ProviderAuthMethodSchema>;

export const ProviderAuthCatalogEntrySchema = Type.Object({
  id: Type.String(),
  name: Type.String(),
  methods: Type.Array(ProviderAuthMethodSchema),
});
export type ProviderAuthCatalogEntry = Static<
  typeof ProviderAuthCatalogEntrySchema
>;

export type ProviderAuthCatalog = readonly ProviderAuthCatalogEntry[];

export const ProviderAuthCatalogSchema = Type.Unsafe<ProviderAuthCatalog>(
  Type.Array(ProviderAuthCatalogEntrySchema),
);

const ProviderAuthCatalogResponseSchema = Type.Object({
  providers: ProviderAuthCatalogSchema,
});

export const ProviderCredentialsSchema = Type.Object({
  providerId: Type.String(),
  methodId: Type.String(),
  values: Type.Record(Type.String(), Type.String()),
});
export type ProviderCredentials = Static<typeof ProviderCredentialsSchema>;

export const OAuthFlowIdSchema = Type.Object({ flowId: Type.String() });

export const OAuthFlowAnswerSchema = Type.Object({
  flowId: Type.String(),
  promptId: Type.String(),
  value: Type.String(),
});

const OAuthFlowProviderSchema = Type.Object({
  flowId: Type.String(),
  providerId: Type.String(),
  actionId: Type.String(),
});

export const OAuthFlowStateSchema = Type.Union([
  Type.Object({
    type: Type.Literal("authorization"),
    ...OAuthFlowProviderSchema.properties,
    url: Type.String(),
    instructions: Type.Optional(Type.String()),
    supportsManualInput: Type.Boolean(),
  }),
  Type.Object({
    type: Type.Literal("device_code"),
    ...OAuthFlowProviderSchema.properties,
    verificationUrl: Type.String(),
    userCode: Type.String(),
    intervalSeconds: Type.Optional(Type.Number()),
    expiresInSeconds: Type.Optional(Type.Number()),
  }),
  Type.Object({
    type: Type.Literal("prompt"),
    ...OAuthFlowProviderSchema.properties,
    promptId: Type.String(),
    message: Type.String(),
    placeholder: Type.Optional(Type.String()),
    allowEmpty: Type.Boolean(),
  }),
  Type.Object({
    type: Type.Literal("select"),
    ...OAuthFlowProviderSchema.properties,
    promptId: Type.String(),
    message: Type.String(),
    options: Type.Array(
      Type.Object({ id: Type.String(), label: Type.String() }),
    ),
  }),
  Type.Object({
    type: Type.Literal("progress"),
    ...OAuthFlowProviderSchema.properties,
    message: Type.String(),
  }),
  Type.Object({
    type: Type.Literal("success"),
    ...OAuthFlowProviderSchema.properties,
  }),
  Type.Object({
    type: Type.Literal("failure"),
    ...OAuthFlowProviderSchema.properties,
    message: Type.String(),
  }),
  Type.Object({
    type: Type.Literal("cancelled"),
    ...OAuthFlowProviderSchema.properties,
  }),
]);
export type OAuthFlowState = Static<typeof OAuthFlowStateSchema>;

const describeProviderAuthenticationPayload = () => ({
  redacted: "provider authentication payload",
});

// Agent channel contract — the single source of truth for substrate agent
// channels. `Type.Unsafe` is used for the complex union types (`AgentEvent`,
// `TranscriptSnapshot`) whose full TypeBox encoding would be
// disproportionate — the runtime types are already validated by the driver
// that produces them.
export const AgentEventSchema = Type.Unsafe<AgentEvent>(Type.Any());

export const agentChannels = {
  feature: "agent",
  requests: {
    prompt: {
      requestSchema: PromptRequestSchema,
      responseSchema: Type.Void(),
    },
    session_history: {
      requestSchema: SessionHistoryRequestSchema,
      responseSchema: SessionHistoryResponseSchema,
    },
    /** Recent durable session graphs, newest filesystem activity first. */
    list_session_summaries: {
      requestSchema: ListSessionSummariesRequestSchema,
      responseSchema: SessionSummaryListSchema,
    },
    /** Replace the active agent slot's selected graph with a fresh session. */
    new_session: {
      requestSchema: Type.Void(),
      responseSchema: SessionSummarySchema,
    },
    /** Available (auth-configured) models with workspace favorite status. */
    list_models: {
      requestSchema: Type.Void(),
      responseSchema: ModelCatalogResponseSchema,
    },
    set_model_favorite: {
      requestSchema: ModelFavoriteUpdateSchema,
      responseSchema: ModelCatalogResponseSchema,
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
    list_auth_providers: {
      requestSchema: Type.Void(),
      responseSchema: ProviderAuthCatalogResponseSchema,
    },
    save_provider_credentials: {
      requestSchema: ProviderCredentialsSchema,
      responseSchema: Type.Void(),
      log: { describeRequest: describeProviderAuthenticationPayload },
    },
    current_oauth_flow: {
      requestSchema: Type.Void(),
      responseSchema: Type.Union([OAuthFlowStateSchema, Type.Null()]),
      log: { describeResponse: describeProviderAuthenticationPayload },
    },
    begin_oauth_flow: {
      requestSchema: Type.Object({
        providerId: Type.String(),
        actionId: Type.String(),
      }),
      responseSchema: OAuthFlowIdSchema,
    },
    answer_oauth_flow: {
      requestSchema: OAuthFlowAnswerSchema,
      responseSchema: Type.Void(),
      log: { describeRequest: describeProviderAuthenticationPayload },
    },
    reopen_oauth_flow: {
      requestSchema: OAuthFlowIdSchema,
      responseSchema: Type.Void(),
    },
    cancel_oauth_flow: {
      requestSchema: OAuthFlowIdSchema,
      responseSchema: Type.Void(),
    },
  },
  events: {
    event: {
      event: AgentEventSchema,
    },
    status_changed: {
      event: AgentStatusSchema,
    },
    oauth_flow_changed: {
      event: OAuthFlowStateSchema,
      log: { describeEvent: describeProviderAuthenticationPayload },
    },
    model_availability_changed: {
      event: Type.Void(),
    },
  },
} as const satisfies ChannelContract;
