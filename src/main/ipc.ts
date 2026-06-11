// UIX cockpit — the renderer↔main IPC boundary.
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
// nothing about any channel's payload shape. Per-channel policy — eliding a
// huge result (`describeResult`), demoting per-token noise (`trace`) — lives
// with the call sites that know the payload type.

import { join } from "node:path";

import { type BrowserWindow, ipcMain } from "electron";
import pino from "pino";

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
  // class. Flip it if armed-mode streaming drags before transcript deltas
  // (docs/plans/backlog.md) collapse the per-token write volume; soften this
  // comment's guarantee to "JS crashes" if you do.
  fileLog = pino(
    { base: undefined },
    pino.destination({ dest: path, mkdir: true, sync: true }),
  );
  log.info({ path }, "ipc_log_file");
}

/** Per-registration wire-log policy. The boundary itself is payload-agnostic. */
export interface HandleLogOptions<Res> {
  /**
   * Substitute recorded in the wire log in place of the raw result — for
   * channels whose results are too large to spool and already live on disk.
   */
  describeResult?: (res: Res) => unknown;
}

/**
 * Register an `ipcMain.handle` invoke endpoint. Returns a Disposable
 * that removes the handler when disposed.
 */
export function handle<Req, Res>(
  channel: string,
  fn: (req: Req) => Res | Promise<Res>,
  logOpts?: HandleLogOptions<Res>,
): Disposable {
  ipcMain.handle(channel, async (_event, req: Req) => {
    record(`in:${channel}`, req);
    try {
      const res = await fn(req);
      record(
        `result:${channel}`,
        logOpts?.describeResult ? logOpts.describeResult(res) : res,
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

/**
 * Push one message to a window. `trace` demotes lines that repeat at
 * per-token cadence.
 */
export function send(
  win: BrowserWindow,
  channel: string,
  payload: unknown,
  trace = false,
): void {
  if (win.isDestroyed()) return;
  record(`out:${channel}`, payload, trace);
  win.webContents.send(channel, payload);
}

function record(msg: string, payload: unknown, trace = false): void {
  fileLog?.info({ payload }, msg);
  log[trace ? "trace" : "debug"]({ payload }, msg);
}
