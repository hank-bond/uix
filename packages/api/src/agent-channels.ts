// Agent channel contract.
//
// The substrate-owned agent channels (prompt/history/event stream) and the
// transcript item shapes they hold. This lives behind @uix/api because
// feature code binds it: chat is an ordinary feature whose surface renders
// the same agent connection any other feature could use. The backend assembles
// the channel contribution via `withHandlers` in the composition root. Frontends derive a
// typed client via `createChannelClient`.

import { type Static, Type } from "typebox";

import type { ChannelContract } from "./channels";

/** Schema for the `prompt` request payload. */
export const PromptRequestSchema = Type.Object({
  text: Type.String(),
});
export type PromptRequest = Static<typeof PromptRequestSchema>;

/** Point-in-time file location derived for a filesystem tool invocation. */
export interface ToolFileLocation {
  /** Absolute path derived from the invocation args and execution cwd. */
  absolutePath: string;
  /** Cwd-relative when that form stays under cwd. Otherwise absolute. */
  displayPath: string;
}

/**
 * Durable transcript items rendered by conversation surfaces. Live events may
 * include in-flight fields on the same item shape. History replay only returns
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
      /** Point-in-time cwd under which this tool invocation executed. */
      cwd: string;
      /** Main-derived reference for filesystem tools whose args identify a file. */
      file?: ToolFileLocation;
      complete: boolean;
      args?: unknown;
      result?: unknown;
      /** Live-only progress payload. Discarded when the tool completes. */
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
       * Set when rekeying changes the row's id: the pre-key transport handle
       * that first delivered the item. The renderer swaps the id in place
       * (position preserved).
       */
      previousId?: string;
    }
  | {
      /**
       * Compact in-flight update to an already-appended item. The renderer is
       * the accumulator: `text` appends to a streaming assistant row's text;
       * `partialResult` overwrites a tool row's live progress payload (Pi
       * tool updates are replacement snapshots, not increments). A full
       * `transcript_replace` still lands at completion, so partials are pure
       * display traffic. Dropping one loses nothing durable.
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

/** Durable identity and lightweight metadata for one session graph. */
export const SessionSummarySchema = Type.Object({
  sessionId: SessionIdSchema,
  /** User-authored title from Pi's latest session_info entry. */
  title: Type.Optional(Type.String()),
  /** Bounded textual projection of the graph's first user message. */
  firstUserMessage: Type.Optional(
    Type.Object({
      preview: Type.String(),
      truncated: Type.Boolean(),
    }),
  ),
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

export const SwitchSessionRequestSchema = Type.Object({
  sessionId: SessionIdSchema,
});
export type SwitchSessionRequest = Static<typeof SwitchSessionRequestSchema>;

export const SetSessionTitleRequestSchema = Type.Object({
  sessionId: SessionIdSchema,
  title: Type.Union([Type.String(), Type.Null()]),
});
export type SetSessionTitleRequest = Static<
  typeof SetSessionTitleRequestSchema
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
 * Current agent status exposed to surfaces. `cwd` is the directory under
 * which tools execute. `model` is the live session model: absent until a
 * session exists, and absent even then when Pi resolved no model (e.g. no
 * provider is authenticated). `defaultModel` is the workspace default:
 * absent until the user first selects one. Both model fields absent means
 * "no model chosen": the UI renders that state rather than inventing a
 * fallback.
 */
export const AgentStatusSchema = Type.Object({
  cwd: Type.String(),
  model: Type.Optional(ModelRefSchema),
  defaultModel: Type.Optional(ModelRefSchema),
});
export type AgentStatus = Static<typeof AgentStatusSchema>;

const ModelCatalogResponseSchema = Type.Object({
  models: ModelCatalogSchema,
});

/** One installed tool's stable display identity, resolved from its definition. */
export const ToolCatalogEntrySchema = Type.Object({
  name: Type.String(),
  label: Type.String(),
});
export type ToolCatalogEntry = Static<typeof ToolCatalogEntrySchema>;
export type ToolCatalog = readonly ToolCatalogEntry[];

export const ToolCatalogSchema = Type.Unsafe<ToolCatalog>(
  Type.Array(ToolCatalogEntrySchema),
);

const ToolCatalogResponseSchema = Type.Object({
  tools: ToolCatalogSchema,
});

export const ProviderAuthTypeSchema = Type.Union([
  Type.Literal("api_key"),
  Type.Literal("oauth"),
]);
export type ProviderAuthType = Static<typeof ProviderAuthTypeSchema>;

const ProviderConnectionSchema = Type.Object({
  source: Type.Union([
    Type.Literal("stored"),
    Type.Literal("environment"),
    Type.Literal("runtime"),
    Type.Literal("configuration"),
  ]),
  label: Type.Optional(Type.String()),
});

export const ProviderAuthMethodSchema = Type.Object({
  providerId: Type.String(),
  authType: ProviderAuthTypeSchema,
  connection: Type.Optional(ProviderConnectionSchema),
});
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

const ProviderAuthLinkSchema = Type.Object({
  linkId: Type.String(),
  url: Type.String(),
  label: Type.Optional(Type.String()),
});
export type ProviderAuthLink = Static<typeof ProviderAuthLinkSchema>;

const ProviderAuthNoticeSchema = Type.Union([
  Type.Object({
    type: Type.Literal("info"),
    message: Type.String(),
    links: Type.Array(ProviderAuthLinkSchema),
  }),
  Type.Object({
    type: Type.Literal("authorization"),
    link: ProviderAuthLinkSchema,
    instructions: Type.Optional(Type.String()),
  }),
  Type.Object({
    type: Type.Literal("device_code"),
    link: ProviderAuthLinkSchema,
    userCode: Type.String(),
    intervalSeconds: Type.Optional(Type.Number()),
    expiresInSeconds: Type.Optional(Type.Number()),
  }),
  Type.Object({
    type: Type.Literal("progress"),
    message: Type.String(),
  }),
]);
export type ProviderAuthNotice = Static<typeof ProviderAuthNoticeSchema>;

const ProviderAuthPromptSchema = Type.Union([
  Type.Object({
    type: Type.Literal("input"),
    promptId: Type.String(),
    message: Type.String(),
    secret: Type.Boolean(),
    placeholder: Type.Optional(Type.String()),
  }),
  Type.Object({
    type: Type.Literal("select"),
    promptId: Type.String(),
    message: Type.String(),
    options: Type.Array(
      Type.Object({
        id: Type.String(),
        label: Type.String(),
        description: Type.Optional(Type.String()),
      }),
    ),
  }),
]);
export type ProviderAuthPrompt = Static<typeof ProviderAuthPromptSchema>;

const ProviderAuthFlowPhaseSchema = Type.Union([
  Type.Object({ type: Type.Literal("starting") }),
  Type.Object({ type: Type.Literal("active") }),
  Type.Object({ type: Type.Literal("success") }),
  Type.Object({
    type: Type.Literal("failure"),
    message: Type.String(),
  }),
  Type.Object({ type: Type.Literal("cancelled") }),
]);

export const ProviderAuthFlowSnapshotSchema = Type.Object({
  flowId: Type.String(),
  providerId: Type.String(),
  authType: ProviderAuthTypeSchema,
  phase: ProviderAuthFlowPhaseSchema,
  notices: Type.Array(ProviderAuthNoticeSchema),
  prompt: Type.Optional(ProviderAuthPromptSchema),
});
export type ProviderAuthFlowSnapshot = Static<
  typeof ProviderAuthFlowSnapshotSchema
>;

export const ProviderAuthFlowAnswerSchema = Type.Object({
  flowId: Type.String(),
  promptId: Type.String(),
  value: Type.String(),
});

const ProviderAuthLinkRequestSchema = Type.Object({
  flowId: Type.String(),
  linkId: Type.String(),
});

const describeProviderAuthenticationPayload = (): { redacted: string } => ({
  redacted: "provider authentication payload",
});

// Agent channel contract: the single source of truth for substrate agent
// channels. `Type.Unsafe` is used for the complex union types (`AgentEvent`,
// `TranscriptSnapshot`) whose full TypeBox encoding would be
// disproportionate. The runtime types are already validated by the driver
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
    /** Replace the active agent slot's selected graph with an existing session. */
    switch_session: {
      requestSchema: SwitchSessionRequestSchema,
      responseSchema: SessionSummarySchema,
    },
    /** Set or clear the explicit title of any durable session graph. */
    set_session_title: {
      requestSchema: SetSessionTitleRequestSchema,
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
    /** Static name → label map for the workspace's installed tool set. */
    tool_catalog: {
      requestSchema: Type.Void(),
      responseSchema: ToolCatalogResponseSchema,
    },
    /**
     * Validated against Pi's available models. Persists the workspace
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
    current_provider_auth_flow: {
      requestSchema: Type.Void(),
      responseSchema: Type.Union([ProviderAuthFlowSnapshotSchema, Type.Null()]),
      log: { describeResponse: describeProviderAuthenticationPayload },
    },
    begin_provider_auth_flow: {
      requestSchema: Type.Object({
        providerId: Type.String(),
        authType: ProviderAuthTypeSchema,
      }),
      responseSchema: ProviderAuthFlowSnapshotSchema,
      log: { describeResponse: describeProviderAuthenticationPayload },
    },
    answer_provider_auth_flow: {
      requestSchema: ProviderAuthFlowAnswerSchema,
      responseSchema: Type.Void(),
      log: { describeRequest: describeProviderAuthenticationPayload },
    },
    open_provider_auth_link: {
      requestSchema: ProviderAuthLinkRequestSchema,
      responseSchema: Type.Void(),
      log: { describeRequest: describeProviderAuthenticationPayload },
    },
    cancel_provider_auth_flow: {
      requestSchema: Type.Object({ flowId: Type.String() }),
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
    provider_auth_flow_changed: {
      event: ProviderAuthFlowSnapshotSchema,
      log: { describeEvent: describeProviderAuthenticationPayload },
    },
    model_availability_changed: {
      event: Type.Void(),
    },
  },
} as const satisfies ChannelContract;
