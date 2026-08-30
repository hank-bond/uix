// Records server WebSocket crossings through one payload-policy boundary.

import type { Logger } from "pino";

interface ServerWireLogOptions<T> {
  readonly describe?: (payload: T) => unknown;
}

/** Record only a crossing that physically entered or left the WebSocket. */
export function recordWebSocketCrossing<T>(
  logger: Logger,
  message: string,
  payload: T,
  options?: ServerWireLogOptions<T>,
): void {
  logger.debug(
    {
      payload: options?.describe ? options.describe(payload) : payload,
    },
    message,
  );
}
