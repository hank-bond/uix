// Relays requests from the renderer to main and sends events back through one logged IPC boundary.
//
// This module records every crossing that passes through it. `handle()`
// is the inbound chokepoint (invoke endpoints), `send()` the outbound one
// (pushes to a window). The wire log lives here too, module-private, so the
// only way to produce a wire-log line is to actually cross the wire. The
// log can be neither dodged nor spoofed. Project policy, enforced for these
// known calls by ESLint: no direct `ipcMain.handle` or `webContents.send`
// outside this module.
//
// The module captures each crossing twice, in the `ipc` log space:
//  - terminal (`ipc` component): the payload itself, rendered by the shared
//    pino-pretty transport. Read with UIX_LOG_LEVEL=debug. Callers can demote
//    chatty lines to trace so debug stays readable.
//  - file: the full raw payload as NDJSON under `<stateRoot>/.uix/logs/`,
//    one per-run file, armed only when the ipc space is audible at all. The
//    logger prints the path at startup (`ipc_log_file`). Inspect with `jq` or
//    `npx pino-pretty < file`.
//
// The boundary is pure mechanism: it records whatever crosses and knows
// nothing about any channel's payload shape. Per-channel policy (redacting a
// sensitive payload, summarizing a huge response, demoting per-token noise)
// lives with the contract or call site that knows the payload type.

import { join } from "node:path";

import { type BrowserWindow, ipcMain } from "electron";
import pino from "pino";

import type { CanonicalRequest, PreparedDispatch } from "@uix/runtime";
import { createLogger } from "@uix/runtime/log";

import { recordWireCrossing } from "./ipc-wire-log";
import { disposable } from "./lifecycle";

const log = createLogger("ipc");

let fileLog: pino.Logger | undefined;

const CanonicalChannelPattern = /^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$/;

/** Read only a log-safe canonical id from an unprepared physical frame. */
function tryParseCanonicalRequestChannel(frame: unknown): string | undefined {
  if (!frame || typeof frame !== "object") return undefined;
  const channel: unknown = (frame as { readonly channel?: unknown }).channel;
  return typeof channel === "string" && CanonicalChannelPattern.test(channel)
    ? channel
    : undefined;
}

/** Arm the raw-payload file capture. Call once startup resolves the state root. */
export function initLogFile(stateRoot: string): void {
  if (!log.isLevelEnabled("debug")) return;
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const path = join(stateRoot, ".uix", "logs", `ipc-${stamp}.ndjson`);
  // `sync` is a deliberate trade, not a default: blocking write per crossing,
  // in exchange for the tail surviving even hard kills (segfault, OOM,
  // SIGKILL). Going buffered (`sync: false, minLength: 4096`) is purely a
  // perf knob. Pino auto-flushes its buffer on any exit that runs handlers,
  // including uncaught exceptions, so buffering only loses the hard-kill
  // class. Streaming now crosses as compact transcript_partial events, so the
  // per-crossing payload is small. Flip this only if armed-mode streaming
  // still drags, and soften this comment's guarantee to "JS crashes" if you
  // do.
  fileLog = pino(
    { base: undefined },
    pino.destination({ dest: path, mkdir: true, sync: true }),
  );
  log.info({ path }, "ipc_log_file");
}

/** Per-handler wire-log policy. The boundary itself is payload-agnostic. */
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
  return disposable(() => {
    ipcMain.removeHandler(channel);
  });
}

/**
 * Register the one generic canonical request endpoint. Contract-owned log
 * policy comes from the prepared dispatch while this host records the actual
 * physical crossing.
 */
export function handleCanonicalRequest(
  physicalChannel: string,
  prepare: (request: CanonicalRequest) => PreparedDispatch,
): Disposable {
  ipcMain.handle(physicalChannel, async (_event, frame: unknown) => {
    const requestChannel = tryParseCanonicalRequestChannel(frame);
    let dispatch: PreparedDispatch;
    try {
      dispatch = prepare(frame as CanonicalRequest);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const logChannel = requestChannel ?? `${physicalChannel}:invalid`;
      recordWireCrossing(
        { terminal: log, file: fileLog },
        `in:${logChannel}`,
        frame,
        {
          describe: () => ({
            channel: requestChannel ?? "invalid",
            redacted: "request payload unavailable before dispatch preparation",
          }),
        },
      );
      fileLog?.info({ err: message }, `error:${logChannel}`);
      log.debug({ err: message }, `error:${logChannel}`);
      throw error;
    }

    using prepared = dispatch;
    const request = prepared.request;
    const logOptions = prepared.logOptions;
    recordWireCrossing(
      { terminal: log, file: fileLog },
      `in:${request.channel}`,
      request.payload,
      { describe: logOptions.describeRequest },
    );
    const response = await prepared.invoke();
    if (!response.ok) {
      fileLog?.info(
        { err: response.error.message },
        `error:${request.channel}`,
      );
      log.debug({ err: response.error.message }, `error:${request.channel}`);
      throw new Error(response.error.message);
    }
    recordWireCrossing(
      { terminal: log, file: fileLog },
      `result:${request.channel}`,
      response.value,
      { describe: logOptions.describeResponse },
    );
    return response.value;
  });
  return disposable(() => {
    ipcMain.removeHandler(physicalChannel);
  });
}

/** Per-send wire-log policy. The boundary itself is payload-agnostic. */
export interface SendOptions<Payload = unknown> {
  /**
   * The payload is an in-flight partial that repeats at streaming cadence
   * (per token / per progress tick). Consequence today: the terminal line
   * logs at trace instead of debug, always. Even small partials are noise
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
