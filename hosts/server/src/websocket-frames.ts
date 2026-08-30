// Defines and validates the server WebSocket transport's physical frames.

import { Type } from "typebox";
import { Value } from "typebox/value";

const CorrelationIdSchema = Type.String({ minLength: 1, maxLength: 128 });
const CanonicalChannelSchema = Type.String({
  pattern: "^[a-z][a-z0-9_]*\\.[a-z][a-z0-9_]*$",
});

const WebSocketReadyFrameSchema = Type.Object(
  {
    type: Type.Literal("ready"),
    sessionId: Type.String({ minLength: 1 }),
    canonicalPath: Type.String({ minLength: 1, pattern: "^/" }),
  },
  { additionalProperties: false },
);

const WebSocketRequestFrameSchema = Type.Object(
  {
    type: Type.Literal("request"),
    id: CorrelationIdSchema,
    channel: CanonicalChannelSchema,
    payload: Type.Optional(Type.Unknown()),
  },
  { additionalProperties: false },
);

const WebSocketResponseFrameSchema = Type.Object(
  {
    type: Type.Literal("response"),
    id: CorrelationIdSchema,
    value: Type.Optional(Type.Unknown()),
  },
  { additionalProperties: false },
);

const WebSocketErrorFrameSchema = Type.Object(
  {
    type: Type.Literal("error"),
    id: Type.Optional(CorrelationIdSchema),
    code: Type.String({ minLength: 1 }),
    message: Type.String({ minLength: 1 }),
    isTerminal: Type.Boolean(),
  },
  { additionalProperties: false },
);

const WebSocketEventFrameSchema = Type.Object(
  {
    type: Type.Literal("event"),
    id: Type.String({ minLength: 1 }),
    channel: CanonicalChannelSchema,
    payload: Type.Optional(Type.Unknown()),
  },
  { additionalProperties: false },
);

const WebSocketServerFrameSchema = Type.Union([
  WebSocketReadyFrameSchema,
  WebSocketResponseFrameSchema,
  WebSocketErrorFrameSchema,
  WebSocketEventFrameSchema,
]);

export interface WebSocketReadyFrame {
  readonly type: "ready";
  readonly sessionId: string;
  readonly canonicalPath: string;
}

export interface WebSocketRequestFrame {
  readonly type: "request";
  readonly id: string;
  readonly channel: string;
  readonly payload?: unknown;
}

export interface WebSocketResponseFrame {
  readonly type: "response";
  readonly id: string;
  readonly value?: unknown;
}

export interface WebSocketErrorFrame {
  readonly type: "error";
  readonly id?: string;
  readonly code: string;
  readonly message: string;
  /** False for a physical protocol rejection that leaves accepted work pending. */
  readonly isTerminal: boolean;
}

export interface WebSocketEventFrame {
  readonly type: "event";
  readonly id: string;
  readonly channel: string;
  readonly payload?: unknown;
}

export type WebSocketServerFrame =
  | WebSocketReadyFrame
  | WebSocketResponseFrame
  | WebSocketErrorFrame
  | WebSocketEventFrame;

/** Validate the first server frame that accepts a session target. */
export function parseWebSocketReadyFrame(value: unknown): WebSocketReadyFrame {
  return Value.Parse(WebSocketReadyFrameSchema, value);
}

/** Validate one canonical client request frame. */
export function parseWebSocketRequestFrame(
  value: unknown,
): WebSocketRequestFrame {
  return Value.Parse(WebSocketRequestFrameSchema, value);
}

/** Validate one server-to-browser WebSocket frame. */
export function parseWebSocketServerFrame(
  value: unknown,
): WebSocketServerFrame {
  return Value.Parse(WebSocketServerFrameSchema, value);
}

/** Read a correlation id without trusting any other client-authored field. */
export function tryParseWebSocketCorrelationId(
  value: unknown,
): string | undefined {
  if (!value || typeof value !== "object") return undefined;
  const id = (value as { readonly id?: unknown }).id;
  return Value.Check(CorrelationIdSchema, id) ? id : undefined;
}

/** Produce one accepted target's WebSocket frame and canonical browser path. */
export function toWebSocketReadyFrame(
  sessionId: string,
  canonicalPath: string,
): WebSocketReadyFrame {
  return Value.Parse(WebSocketReadyFrameSchema, {
    type: "ready",
    sessionId,
    canonicalPath,
  });
}
