// Creates main-process loggers that label messages by component and choose readable or JSON output for the environment.
//
// Thin wrapper around pino so:
//   - call sites use one shape: `log.info({ ...fields }, "event_name")`
//   - every line carries a `component` field for filtering
//   - dev gets pretty-printed colorized output; prod gets JSON
//   - extensions get attributed loggers via child(): `log.child({ extension: id })`
//
// Conventions live in docs/architecture/conventions/logging.md.

import process from "node:process";

import pino, { type Logger } from "pino";

const isDev = process.env["NODE_ENV"] !== "production";

const base = pino({
  level: process.env["UIX_LOG_LEVEL"] ?? "info",
  ...(isDev && {
    transport: {
      target: "pino-pretty",
      options: {
        colorize: true,
        translateTime: "HH:MM:ss.l",
        ignore: "pid,hostname,component",
        messageFormat: "({component}) {msg}",
      },
    },
  }),
});

export const createLogger = (component: string): Logger =>
  base.child({ component });

export type { Logger };
