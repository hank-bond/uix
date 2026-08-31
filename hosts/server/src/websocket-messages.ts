// Defines and validates the server WebSocket transport's application messages.

import { Type } from "typebox";
import { Value } from "typebox/value";

const CorrelationIdSchema = Type.String({ minLength: 1, maxLength: 128 });
const CanonicalChannelSchema = Type.String({
  pattern: "^[a-z][a-z0-9_]*\\.[a-z][a-z0-9_]*$",
});

const WebSocketReadyMessageSchema = Type.Object(
  {
    type: Type.Literal("ready"),
    sessionId: Type.String({ minLength: 1 }),
    canonicalPath: Type.String({ minLength: 1, pattern: "^/" }),
  },
  { additionalProperties: false },
);

const WebSocketRequestMessageSchema = Type.Object(
  {
    type: Type.Literal("request"),
    id: CorrelationIdSchema,
    channel: CanonicalChannelSchema,
    payload: Type.Optional(Type.Unknown()),
  },
  { additionalProperties: false },
);

const WebSocketResponseMessageSchema = Type.Object(
  {
    type: Type.Literal("response"),
    id: CorrelationIdSchema,
    value: Type.Optional(Type.Unknown()),
  },
  { additionalProperties: false },
);

const WebSocketErrorMessageSchema = Type.Object(
  {
    type: Type.Literal("error"),
    id: Type.Optional(CorrelationIdSchema),
    code: Type.String({ minLength: 1 }),
    message: Type.String({ minLength: 1 }),
    isTerminal: Type.Boolean(),
  },
  { additionalProperties: false },
);

const WebSocketEventMessageSchema = Type.Object(
  {
    type: Type.Literal("event"),
    id: Type.String({ minLength: 1 }),
    channel: CanonicalChannelSchema,
    payload: Type.Optional(Type.Unknown()),
  },
  { additionalProperties: false },
);

const WebSocketServerMessageSchema = Type.Union([
  WebSocketReadyMessageSchema,
  WebSocketResponseMessageSchema,
  WebSocketErrorMessageSchema,
  WebSocketEventMessageSchema,
]);

export interface WebSocketReadyMessage {
  readonly type: "ready";
  readonly sessionId: string;
  readonly canonicalPath: string;
}

export interface WebSocketRequestMessage {
  readonly type: "request";
  readonly id: string;
  readonly channel: string;
  readonly payload?: unknown;
}

export interface WebSocketResponseMessage {
  readonly type: "response";
  readonly id: string;
  readonly value?: unknown;
}

export interface WebSocketErrorMessage {
  readonly type: "error";
  readonly id?: string;
  readonly code: string;
  readonly message: string;
  /** False for a physical protocol rejection that leaves accepted work pending. */
  readonly isTerminal: boolean;
}

export interface WebSocketEventMessage {
  readonly type: "event";
  readonly id: string;
  readonly channel: string;
  readonly payload?: unknown;
}

export type WebSocketServerMessage =
  | WebSocketReadyMessage
  | WebSocketResponseMessage
  | WebSocketErrorMessage
  | WebSocketEventMessage;

/** Validate the first server message that accepts a session target. */
export function parseWebSocketReadyMessage(
  value: unknown,
): WebSocketReadyMessage {
  return Value.Parse(WebSocketReadyMessageSchema, value);
}

/** Validate one canonical client request message. */
export function parseWebSocketRequestMessage(
  value: unknown,
): WebSocketRequestMessage {
  return Value.Parse(WebSocketRequestMessageSchema, value);
}

/** Validate one server-to-browser WebSocket message. */
export function parseWebSocketServerMessage(
  value: unknown,
): WebSocketServerMessage {
  return Value.Parse(WebSocketServerMessageSchema, value);
}

/** Read a correlation id without trusting any other client-authored field. */
export function tryParseWebSocketCorrelationId(
  value: unknown,
): string | undefined {
  if (!value || typeof value !== "object") return undefined;
  const id = (value as { readonly id?: unknown }).id;
  return Value.Check(CorrelationIdSchema, id) ? id : undefined;
}

/** Produce one accepted target's WebSocket message and canonical browser path. */
export function toWebSocketReadyMessage(
  sessionId: string,
  canonicalPath: string,
): WebSocketReadyMessage {
  return Value.Parse(WebSocketReadyMessageSchema, {
    type: "ready",
    sessionId,
    canonicalPath,
  });
}
