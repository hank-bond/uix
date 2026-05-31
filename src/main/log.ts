// Structured logging for the main process.
//
// Thin wrapper around pino so:
//   - call sites use one shape: `log.info({ ...fields }, "event_name")`
//   - every line carries a `component` field for filtering
//   - dev gets pretty-printed colorized output; prod gets JSON
//   - extensions get attributed loggers via child(): `log.child({ extension: id })`
//
// Conventions live in docs/conventions.md (logging section).

import pino, { type Logger } from "pino";

const isDev = process.env["NODE_ENV"] !== "production";

const base = pino({
  level: process.env["TRELLIS_LOG_LEVEL"] ?? "info",
  ...(isDev && {
    transport: {
      target: "pino-pretty",
      options: {
        colorize: true,
        translateTime: "HH:MM:ss.l",
        ignore: "pid,hostname",
        messageFormat: "({component}) {msg}",
      },
    },
  }),
});

export const createLogger = (component: string): Logger =>
  base.child({ component });

export type { Logger };
