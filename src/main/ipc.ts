// the renderer↔main IPC boundary.
//
// Every crossing goes through this module and is recorded by it. `handle()`
// is the inbound chokepoint (invoke endpoints), `send()` the outbound one
// (pushes to a window). The wire log lives here too, module-private, so the
// only way to produce a wire-log line is to actually cross the wire — the
// log can be neither dodged nor spoofed. Project policy (enforced by
// convention for now, eslint later): no direct `ipcMain.handle` or
// `webContents.send` outside this module.
//
// Each crossing is captured twice, in the `ipc` log space:
//  - terminal (`ipc` component): the payload itself, rendered by the shared
//    pino-pretty transport. Read with UIX_LOG_LEVEL=debug; callers can demote
//    chatty lines to trace so debug stays readable.
//  - file: the full raw payload as NDJSON under `<stateRoot>/.uix/logs/`,
//    one per-run file, armed only when the ipc space is audible at all. The
//    path is printed at startup (`ipc_log_file`). Inspect with `jq` or
//    `npx pino-pretty < file`.
//
// The boundary is pure mechanism: it records whatever crosses and knows
// nothing about any channel's payload shape. Per-channel policy — redacting a
// sensitive payload, summarizing a huge response, demoting per-token noise —
// lives with the contract or call site that knows the payload type.

import { join } from "node:path";

import { type BrowserWindow, ipcMain } from "electron";
import pino from "pino";

import { recordWireCrossing } from "./ipc-wire-log";
import { disposable } from "./lifecycle";
import { createLogger } from "./log";

const log = createLogger("ipc");

let fileLog: pino.Logger | undefined;

/** Arm the raw-payload file capture. Call once the state root is resolved. */
export function initLogFile(stateRoot: string): void {
  if (!log.isLevelEnabled("debug")) return;
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const path = join(stateRoot, ".uix", "logs", `ipc-${stamp}.ndjson`);
  // `sync` is a deliberate trade, not a default: blocking write per crossing,
  // in exchange for the tail surviving even hard kills (segfault, OOM,
  // SIGKILL). Going buffered (`sync: false, minLength: 4096`) is purely a
  // perf knob — pino auto-flushes its buffer on any exit that runs handlers,
  // including uncaught exceptions, so buffering only loses the hard-kill
  // class. Streaming now crosses as compact transcript_partial events, so the
  // per-crossing payload is small; flip this only if armed-mode streaming
  // still drags, and soften this comment's guarantee to "JS crashes" if you
  // do.
  fileLog = pino(
    { base: undefined },
    pino.destination({ dest: path, mkdir: true, sync: true }),
  );
  log.info({ path }, "ipc_log_file");
}

/** Per-registration wire-log policy. The boundary itself is payload-agnostic. */
export interface HandleLogOptions<Req, Res> {
  /** Substitute recorded in place of the raw request. */
  describeRequest?: (req: Req) => unknown;
  /** Substitute recorded in place of the raw response. */
  describeResponse?: (res: Res) => unknown;
}

/**
 * Register an `ipcMain.handle` invoke endpoint. Returns a Disposable
 * that removes the handler when disposed.
 */
export function handle<Req, Res>(
  channel: string,
  fn: (req: Req) => Res | Promise<Res>,
  logOpts?: HandleLogOptions<Req, Res>,
): Disposable {
  ipcMain.handle(channel, async (_event, req: Req) => {
    recordWireCrossing({ terminal: log, file: fileLog }, `in:${channel}`, req, {
      describe: logOpts?.describeRequest,
    });
    try {
      const res = await fn(req);
      recordWireCrossing(
        { terminal: log, file: fileLog },
        `result:${channel}`,
        res,
        { describe: logOpts?.describeResponse },
      );
      return res;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      fileLog?.info({ err: message }, `error:${channel}`);
      log.debug({ err: message }, `error:${channel}`);
      throw err;
    }
  });
  return disposable(() => ipcMain.removeHandler(channel));
}

/** Per-send wire-log policy. The boundary itself is payload-agnostic. */
export interface SendOptions<Payload = unknown> {
  /**
   * The payload is an in-flight partial that repeats at streaming cadence
   * (per token / per progress tick). Consequence today: the terminal line
   * logs at trace instead of debug, always — even small partials are noise
   * at that rate. Whatever else partial-ness implies later hangs off this
   * flag, not off new parameters.
   */
  partial?: boolean;
  /** Substitute recorded in place of the raw event payload. */
  describePayload?: (payload: Payload) => unknown;
}

/** Push one message to a window. */
export function send<Payload>(
  win: BrowserWindow,
  channel: string,
  payload: Payload,
  opts?: SendOptions<Payload>,
): void {
  if (win.isDestroyed()) return;
  recordWireCrossing(
    { terminal: log, file: fileLog },
    `out:${channel}`,
    payload,
    {
      partial: opts?.partial,
      describe: opts?.describePayload,
    },
  );
  win.webContents.send(channel, payload);
}
