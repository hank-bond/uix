// Binds one accepted workspace attachment to correlated messages, scoped events, and heartbeat liveness.

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
  parseWebSocketRequestMessage,
  tryParseWebSocketCorrelationId,
  type WebSocketErrorMessage,
  type WebSocketEventMessage,
  type WebSocketReadyMessage,
  type WebSocketRequestMessage,
  type WebSocketResponseMessage,
} from "../websocket-messages";

const log = createLogger("server-websocket-wire");
const HeartbeatIntervalMs = 30_000;

/** Bind post-handshake protocol processing to one attachment-owned connection. */
export function bindWorkspaceWebSocket(
  socket: WebSocket,
  attachment: Attachment,
  readyMessage: WebSocketReadyMessage,
): Disposable {
  const inFlightRequestIds = new Set<string>();
  let isDisposed = false;

  const eventSubscription = attachment.onEvent((event) => {
    if (!isDisposed) sendEventMessage(socket, event);
  });
  const messageHandler = (data: unknown, isBinary: boolean): void => {
    if (isDisposed) return;
    if (isBinary) {
      sendProtocolErrorMessage(
        socket,
        undefined,
        "malformed_message",
        "WebSocket messages must be JSON text",
      );
      return;
    }
    acceptWebSocketRequest(socket, attachment, inFlightRequestIds, data);
  };
  socket.on("message", messageHandler);
  const heartbeat = bindHeartbeat(socket);

  try {
    sendMessage(socket, readyMessage, "out:ready", readyMessage);
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
  let decodedMessage: unknown;
  try {
    decodedMessage = JSON.parse(String(rawData)) as unknown;
  } catch {
    recordMalformedRequestMessage(undefined);
    sendProtocolErrorMessage(
      socket,
      undefined,
      "malformed_message",
      "WebSocket message is not valid JSON",
    );
    return;
  }

  let message: WebSocketRequestMessage;
  try {
    message = parseWebSocketRequestMessage(decodedMessage);
  } catch {
    const correlationId = tryParseWebSocketCorrelationId(decodedMessage);
    recordMalformedRequestMessage(correlationId);
    sendProtocolErrorMessage(
      socket,
      correlationId,
      "malformed_message",
      "Invalid WebSocket request message",
    );
    return;
  }

  if (inFlightRequestIds.has(message.id)) {
    recordMalformedRequestMessage(message.id);
    sendProtocolErrorMessage(
      socket,
      message.id,
      "correlation_in_use",
      `Correlation id is already in use: ${message.id}`,
    );
    return;
  }

  inFlightRequestIds.add(message.id);
  void sendRequestResponse(socket, attachment, message).finally(() => {
    inFlightRequestIds.delete(message.id);
  });
}

async function sendRequestResponse(
  socket: WebSocket,
  attachment: Attachment,
  message: WebSocketRequestMessage,
): Promise<void> {
  let preparedDispatch: PreparedDispatch;
  try {
    preparedDispatch = attachment.prepareDispatch({
      channel: parseChannelCanonicalId(message.channel),
      payload: message.payload,
    });
  } catch (error) {
    recordMalformedRequestMessage(message.id, message.channel);
    sendTerminalErrorMessage(
      socket,
      message.id,
      "dispatch_unavailable",
      error instanceof Error ? error.message : String(error),
      message.channel,
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
  sendCanonicalResponse(socket, message.id, prepared, response);
}

function sendCanonicalResponse(
  socket: WebSocket,
  requestId: string,
  preparedDispatch: PreparedDispatch,
  response: CanonicalResponse,
): void {
  if (!response.ok) {
    sendTerminalErrorMessage(
      socket,
      requestId,
      response.error.code,
      response.error.message,
      preparedDispatch.request.channel,
    );
    return;
  }

  const responseMessage: WebSocketResponseMessage = {
    type: "response",
    id: requestId,
    ...(response.value === undefined ? {} : { value: response.value }),
  };
  try {
    sendMessage(
      socket,
      responseMessage,
      `result:${preparedDispatch.request.channel}`,
      response.value,
      preparedDispatch.logOptions.describeResponse,
    );
  } catch (error) {
    sendTerminalErrorMessage(
      socket,
      requestId,
      "response_encoding_failed",
      error instanceof Error ? error.message : String(error),
      preparedDispatch.request.channel,
    );
  }
}

function sendEventMessage(socket: WebSocket, event: RuntimeEvent): void {
  const eventMessage: WebSocketEventMessage = {
    type: "event",
    id: event.id,
    channel: event.channel,
    ...(event.payload === undefined ? {} : { payload: event.payload }),
  };
  try {
    sendMessage(
      socket,
      eventMessage,
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

function sendTerminalErrorMessage(
  socket: WebSocket,
  requestId: string,
  code: string,
  message: string,
  channel: string,
): void {
  const errorMessage: WebSocketErrorMessage = {
    type: "error",
    id: requestId,
    code,
    message,
    isTerminal: true,
  };
  sendMessage(socket, errorMessage, `error:${channel}`, { code, message });
}

function sendProtocolErrorMessage(
  socket: WebSocket,
  correlationId: string | undefined,
  code: string,
  message: string,
): void {
  const errorMessage: WebSocketErrorMessage = {
    type: "error",
    ...(correlationId === undefined ? {} : { id: correlationId }),
    code,
    message,
    isTerminal: false,
  };
  sendMessage(socket, errorMessage, "out:protocol_error", {
    correlationId,
    code,
    message,
  });
}

function sendMessage<Payload>(
  socket: WebSocket,
  message:
    | WebSocketReadyMessage
    | WebSocketResponseMessage
    | WebSocketErrorMessage
    | WebSocketEventMessage,
  logLabel: string,
  payload: Payload,
  describe?: (payload: Payload) => unknown,
): void {
  const encodedMessage = JSON.stringify(message);
  if (socket.readyState !== socket.OPEN) return;
  recordWebSocketCrossing(log, logLabel, payload, { describe });
  socket.send(encodedMessage);
}

function recordMalformedRequestMessage(
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
