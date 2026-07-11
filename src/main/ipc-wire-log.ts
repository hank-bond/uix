import type { Logger } from "pino";

interface WireLoggers {
  terminal: Logger;
  file?: Logger;
}

interface WireLogOptions<T> {
  partial?: boolean;
  describe?: (payload: T) => unknown;
}

export function recordWireCrossing<T>(
  loggers: WireLoggers,
  message: string,
  payload: T,
  options?: WireLogOptions<T>,
): void {
  const recordedPayload = options?.describe
    ? options.describe(payload)
    : payload;
  loggers.file?.info({ payload: recordedPayload }, message);
  loggers.terminal[options?.partial ? "trace" : "debug"](
    { payload: recordedPayload },
    message,
  );
}
