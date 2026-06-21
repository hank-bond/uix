// UIX cockpit — main process.
//
// Owns app lifecycle, creates the BrowserWindow, and registers the IPC
// channels declared in src/shared/ipc.ts.
//
// All registrations (IPC handlers, app events, window events) flow
// through the helpers in src/main/ipc.ts and src/main/lifecycle.ts and
// land in a single `appBag`. One dispose on `will-quit` tears the whole
// tree down. See docs/architecture/conventions.md.

import { app, BrowserWindow } from "electron";
import { join } from "node:path";
import process from "node:process";

import {
  type AgentEvent,
  type CanvasChanged,
  type CanvasWriteback,
  Channels,
  type TranscriptSnapshot,
  type PromptRequest,
  type ReloadResult,
} from "../shared/ipc";
import { assertCanvasKey } from "../shared/canvas";

import { createAgentDriver } from "./agent/driver";
import { createStateMessages } from "./agent/state-messages";
import { createStateRegistry } from "./state/registry";
import { registerCanvasProtocol } from "./canvas/protocol";
import { createCanvasAgentInstaller } from "./content/agent-installer";
import { createCanvasContentStore } from "./content/content-store";
import { loadExtensions } from "./extensions/loader";
import { defaultRoots } from "./extensions/roots";
import { resolveWorkspace } from "./workspace";
import * as ipc from "./ipc";
import {
  DisposableBag,
  installProcessHandlers,
  onApp,
  onWindow,
} from "./lifecycle";
import { createLogger } from "./log";

const isDev = !app.isPackaged;

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1100,
    height: 720,
    title: "UIX",
    webPreferences: {
      preload: join(__dirname, "../preload/index.js"),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  const devUrl = process.env["ELECTRON_RENDERER_URL"];
  if (isDev && devUrl) {
    void win.loadURL(devUrl);
  } else {
    void win.loadFile(join(__dirname, "../renderer/index.html"));
  }

  return win;
}

function sendAgentEvent(win: BrowserWindow | null, event: AgentEvent): void {
  logChatContent(event);
  if (win) {
    // Partials repeat at per-token/per-tick cadence; flagging them lets the
    // boundary demote that noise regardless of payload size.
    ipc.send(win, Channels.agentEvent, event, {
      partial: event.type === "transcript_partial",
    });
  }
}

// Level policy: what the chat displays is info; plumbing is debug; partials
// are trace. The IPC boundary already records every crossing at debug/trace,
// so these info lines exist purely to keep the human-visible conversation
// readable in the default log.
function logChatContent(event: AgentEvent): void {
  if (event.type !== "transcript_append" && event.type !== "transcript_replace")
    return;
  const item = event.item;
  if (item.kind === "user") {
    createLogger("chat").info({ text: item.text }, "user_message");
    return;
  }
  // The completion replace logs once; the same-text rekey replace (carries
  // previousId) and streaming partials do not.
  if (
    item.kind === "assistant" &&
    item.complete &&
    event.type === "transcript_replace" &&
    event.previousId === undefined
  ) {
    createLogger("chat").info({ text: item.text }, "assistant_message");
  }
}

function sendCanvasChanged(key: string): void {
  createLogger("canvas").debug({ key }, "canvas_changed");
  for (const win of BrowserWindow.getAllWindows()) {
    ipc.send(win, Channels.canvasChanged, { key });
  }
}

void app.whenReady().then(async () => {
  // One bag for everything that lives as long as the app does.
  // Anything we register goes in here; `will-quit` disposes it.
  const appBag = new DisposableBag();

  // Process-level error handlers are the catch-all for anything
  // that escapes the synchronous call stack — an extension's
  // interval throwing, a stray promise rejection in cockpit code.
  // They go in early so they're armed before any user code runs.
  appBag.add(installProcessHandlers(createLogger("main")));

  // One resolved workspace: stateRoot pins canvases + the session file; agentCwd
  // is what the agent's tools operate against (see ./workspace.ts).
  const workspace = resolveWorkspace();

  // Raw IPC payloads spill to a per-run file under the state root; path is
  // logged as `ipc_log_file` when armed.
  ipc.initLogFile(workspace.stateRoot);

  appBag.add(registerCanvasProtocol(workspace.stateRoot));

  // Extensions live under their own child scope so reload can tear
  // down the extension subtree without touching app-lifetime process
  // handlers, the window, the agent driver, or IPC registrations.
  const roots = defaultRoots();
  const extensionsBag = appBag.add(new DisposableBag());
  const { loaded, failed } = await loadExtensions(roots, extensionsBag);
  createLogger("extensions").debug(
    { loaded: loaded.length, failed: failed.length },
    "activation_complete",
  );

  let mainWindow: BrowserWindow | null = createWindow();
  appBag.add(
    onWindow(mainWindow, "closed", () => {
      mainWindow = null;
    }),
  );

  // One canvas store shared by the agent's buffer and the human-writeback
  // handler, so both commit through the same seam — and pick up versioning
  // together once the store gains it.
  const canvasStore = createCanvasContentStore(workspace.stateRoot);

  // The cockpit-private state pathway records durable refs at turn boundaries.
  const state = createStateRegistry();

  // The cockpit→agent state pathway; contributions register their messageType
  // against it and the driver flushes them while preparing each agent run.
  const stateMessages = createStateMessages();

  const driver = createAgentDriver({
    onEvent: (event) => sendAgentEvent(mainWindow, event),
    workspace,
    state,
    stateMessages,
    agentInstallers: [
      // Open canvases are hardcoded to match the single pane (Canvas.tsx);
      // swap for pane-reported keys when the pane host lands.
      createCanvasAgentInstaller(
        { onCanvasChanged: sendCanvasChanged },
        canvasStore,
        ["main"],
        stateMessages,
        state,
      ),
    ],
  });
  appBag.add(driver);
  // Eager, off the boot path: loads the session file so getHistory() resolves
  // fast. The auth-bearing live agent stays lazy until the first prompt.
  driver.init();

  appBag.add(
    ipc.handle<PromptRequest, void>(Channels.prompt, (req) => {
      // Fire and forget — the renderer subscribes to the event stream,
      // and `invoke` resolves once the prompt has been accepted.
      void driver.prompt(req.text);
    }),
  );

  appBag.add(
    ipc.handle<void, TranscriptSnapshot>(
      Channels.history,
      () => driver.history(),
      {
        // A snapshot is the entire persisted transcript, already on disk — the
        // wire log records a pointer instead of duplicating it.
        describeResult: (snap) => ({
          items: snap.items.length,
          ref: driver.sessionFile(),
        }),
      },
    ),
  );

  appBag.add(
    ipc.handle<CanvasChanged, void>(Channels.canvasRefresh, (req) => {
      assertCanvasKey(req.key);
      sendCanvasChanged(req.key);
    }),
  );

  appBag.add(
    ipc.handle<CanvasWriteback, void>(Channels.canvasWriteback, async (req) => {
      assertCanvasKey(req.key);
      createLogger("canvas").debug(
        { key: req.key, bytes: req.html.length },
        "canvas_writeback",
      );
      // No broadcast: the pane already shows the human's edit, and the channel
      // pulls from the store on its next turn.
      await canvasStore.commit(req.key, req.html);
    }),
  );

  appBag.add(
    ipc.handle<void, ReloadResult>(Channels.reload, async () => {
      const reloadLog = createLogger("main");
      reloadLog.debug({}, "reload_started");

      try {
        const extensionResult = await loadExtensions(roots, extensionsBag);
        const piReloaded = await driver.reload();
        reloadLog.debug(
          {
            extensionsLoaded: extensionResult.loaded.length,
            extensionsFailed: extensionResult.failed.length,
            piReloaded,
          },
          "reload_completed",
        );
        return {
          extensionsLoaded: extensionResult.loaded.length,
          extensionsFailed: extensionResult.failed.length,
          piReloaded,
        };
      } catch (thrown) {
        const error =
          thrown instanceof Error ? thrown : new Error(String(thrown));
        reloadLog.error(
          { err: error.message, stack: error.stack },
          "reload_failed",
        );
        throw error;
      }
    }),
  );

  appBag.add(
    onApp("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        mainWindow = createWindow();
        appBag.add(
          onWindow(mainWindow, "closed", () => {
            mainWindow = null;
          }),
        );
      }
    }),
  );

  appBag.add(
    onApp("window-all-closed", () => {
      if (process.platform !== "darwin") app.quit();
    }),
  );

  // Dispose the whole tree on shutdown. Registered raw (not via
  // onApp) because the listener's job IS to dispose appBag — putting
  // it in the bag would make teardown circular. The handler is a
  // one-shot process-end event with no useful moment to remove it
  // anyway, so the lack of cleanup is fine.
  // eslint-disable-next-line no-restricted-syntax -- documented exception
  app.on("will-quit", () => {
    appBag[Symbol.dispose]();
  });
});
