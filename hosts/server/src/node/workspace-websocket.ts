// Binds one accepted workspace attachment to correlated frames, scoped events, and heartbeat liveness.

import type { WebSocket } from "@fastify/websocket";

import {
  type ChannelCanonicalId,
  toChannelCanonicalId,
} from "@uix/api/channel-resolution";
import type {
  Attachment,
  CanonicalResponse,
  PreparedDispatch,
  RuntimeEvent,
} from "@uix/runtime";
import { createLogger } from "@uix/runtime/log";

import { recordWebSocketCrossing } from "./websocket-wire-log";
import {
  parseWebSocketRequestFrame,
  tryParseWebSocketCorrelationId,
  type WebSocketErrorFrame,
  type WebSocketEventFrame,
  type WebSocketReadyFrame,
  type WebSocketRequestFrame,
  type WebSocketResponseFrame,
} from "../websocket-frames";

const log = createLogger("server-websocket-wire");
const HeartbeatIntervalMs = 30_000;

/** Bind post-handshake protocol processing to one attachment-owned connection. */
export function bindWorkspaceWebSocket(
  socket: WebSocket,
  attachment: Attachment,
  readyFrame: WebSocketReadyFrame,
): Disposable {
  const inFlightRequestIds = new Set<string>();
  let isDisposed = false;

  const eventSubscription = attachment.onEvent((event) => {
    if (!isDisposed) sendEventFrame(socket, event);
  });
  const messageHandler = (data: unknown, isBinary: boolean): void => {
    if (isDisposed) return;
    if (isBinary) {
      sendProtocolErrorFrame(
        socket,
        undefined,
        "malformed_frame",
        "WebSocket frames must be JSON text",
      );
      return;
    }
    acceptWebSocketRequest(socket, attachment, inFlightRequestIds, data);
  };
  socket.on("message", messageHandler);
  const heartbeat = bindHeartbeat(socket);

  try {
    sendFrame(socket, readyFrame, "out:ready", readyFrame);
  } catch (error) {
    heartbeat[Symbol.dispose]();
    socket.off("message", messageHandler);
    eventSubscription[Symbol.dispose]();
    throw error;
  }

  return {
    [Symbol.dispose](): void {
      if (isDisposed) return;
      isDisposed = true;
      heartbeat[Symbol.dispose]();
      socket.off("message", messageHandler);
      eventSubscription[Symbol.dispose]();
    },
  };
}

function bindHeartbeat(socket: WebSocket): Disposable {
  let stopped = false;
  let awaitingPong = false;
  const pongHandler = (): void => {
    awaitingPong = false;
  };
  const stop = (): void => {
    if (stopped) return;
    stopped = true;
    clearInterval(timer);
    socket.off("pong", pongHandler);
  };
  const timer = setInterval(() => {
    if (socket.readyState !== socket.OPEN) return;
    if (awaitingPong) {
      stop();
      socket.terminate();
      return;
    }
    awaitingPong = true;
    try {
      socket.ping();
    } catch {
      stop();
      socket.terminate();
    }
  }, HeartbeatIntervalMs);
  timer.unref();
  socket.on("pong", pongHandler);
  return { [Symbol.dispose]: stop };
}

function acceptWebSocketRequest(
  socket: WebSocket,
  attachment: Attachment,
  inFlightRequestIds: Set<string>,
  rawData: unknown,
): void {
  let decodedFrame: unknown;
  try {
    decodedFrame = JSON.parse(String(rawData)) as unknown;
  } catch {
    recordMalformedRequestFrame(undefined);
    sendProtocolErrorFrame(
      socket,
      undefined,
      "malformed_frame",
      "WebSocket frame is not valid JSON",
    );
    return;
  }

  let frame: WebSocketRequestFrame;
  try {
    frame = parseWebSocketRequestFrame(decodedFrame);
  } catch {
    const correlationId = tryParseWebSocketCorrelationId(decodedFrame);
    recordMalformedRequestFrame(correlationId);
    sendProtocolErrorFrame(
      socket,
      correlationId,
      "malformed_frame",
      "Invalid WebSocket request frame",
    );
    return;
  }

  if (inFlightRequestIds.has(frame.id)) {
    recordMalformedRequestFrame(frame.id);
    sendProtocolErrorFrame(
      socket,
      frame.id,
      "correlation_in_use",
      `Correlation id is already in use: ${frame.id}`,
    );
    return;
  }

  inFlightRequestIds.add(frame.id);
  void sendRequestResponse(socket, attachment, frame).finally(() => {
    inFlightRequestIds.delete(frame.id);
  });
}

async function sendRequestResponse(
  socket: WebSocket,
  attachment: Attachment,
  frame: WebSocketRequestFrame,
): Promise<void> {
  let preparedDispatch: PreparedDispatch;
  try {
    preparedDispatch = attachment.prepareDispatch({
      channel: parseChannelCanonicalId(frame.channel),
      payload: frame.payload,
    });
  } catch (error) {
    recordMalformedRequestFrame(frame.id, frame.channel);
    sendTerminalErrorFrame(
      socket,
      frame.id,
      "dispatch_unavailable",
      error instanceof Error ? error.message : String(error),
      frame.channel,
    );
    return;
  }

  using prepared = preparedDispatch;
  recordWebSocketCrossing(
    log,
    `in:${prepared.request.channel}`,
    prepared.request.payload,
    { describe: prepared.logOptions.describeRequest },
  );
  const response = await prepared.invoke();
  sendCanonicalResponse(socket, frame.id, prepared, response);
}

function sendCanonicalResponse(
  socket: WebSocket,
  requestId: string,
  preparedDispatch: PreparedDispatch,
  response: CanonicalResponse,
): void {
  if (!response.ok) {
    sendTerminalErrorFrame(
      socket,
      requestId,
      response.error.code,
      response.error.message,
      preparedDispatch.request.channel,
    );
    return;
  }

  const responseFrame: WebSocketResponseFrame = {
    type: "response",
    id: requestId,
    ...(response.value === undefined ? {} : { value: response.value }),
  };
  try {
    sendFrame(
      socket,
      responseFrame,
      `result:${preparedDispatch.request.channel}`,
      response.value,
      preparedDispatch.logOptions.describeResponse,
    );
  } catch (error) {
    sendTerminalErrorFrame(
      socket,
      requestId,
      "response_encoding_failed",
      error instanceof Error ? error.message : String(error),
      preparedDispatch.request.channel,
    );
  }
}

function sendEventFrame(socket: WebSocket, event: RuntimeEvent): void {
  const eventFrame: WebSocketEventFrame = {
    type: "event",
    id: event.id,
    channel: event.channel,
    ...(event.payload === undefined ? {} : { payload: event.payload }),
  };
  try {
    sendFrame(
      socket,
      eventFrame,
      `out:${event.channel}`,
      event.payload,
      event.logOptions?.describeEvent,
    );
  } catch (error) {
    log.error(
      {
        err: error,
        channel: event.channel,
        eventId: event.id,
      },
      "websocket_event_encoding_failed",
    );
  }
}

function sendTerminalErrorFrame(
  socket: WebSocket,
  requestId: string,
  code: string,
  message: string,
  channel: string,
): void {
  const errorFrame: WebSocketErrorFrame = {
    type: "error",
    id: requestId,
    code,
    message,
    isTerminal: true,
  };
  sendFrame(socket, errorFrame, `error:${channel}`, { code, message });
}

function sendProtocolErrorFrame(
  socket: WebSocket,
  correlationId: string | undefined,
  code: string,
  message: string,
): void {
  const errorFrame: WebSocketErrorFrame = {
    type: "error",
    ...(correlationId === undefined ? {} : { id: correlationId }),
    code,
    message,
    isTerminal: false,
  };
  sendFrame(socket, errorFrame, "out:protocol_error", {
    correlationId,
    code,
    message,
  });
}

function sendFrame<Payload>(
  socket: WebSocket,
  frame:
    | WebSocketReadyFrame
    | WebSocketResponseFrame
    | WebSocketErrorFrame
    | WebSocketEventFrame,
  message: string,
  payload: Payload,
  describe?: (payload: Payload) => unknown,
): void {
  const encodedFrame = JSON.stringify(frame);
  if (socket.readyState !== socket.OPEN) return;
  recordWebSocketCrossing(log, message, payload, { describe });
  socket.send(encodedFrame);
}

function recordMalformedRequestFrame(
  correlationId?: string,
  channel?: string,
): void {
  recordWebSocketCrossing(log, "in:invalid", {
    ...(correlationId === undefined ? {} : { correlationId }),
    ...(channel === undefined ? {} : { channel }),
    redacted: "payload unavailable before dispatch preparation",
  });
}

function parseChannelCanonicalId(channel: string): ChannelCanonicalId {
  const separator = channel.indexOf(".");
  return toChannelCanonicalId(
    channel.slice(0, separator),
    channel.slice(separator + 1),
  );
}
