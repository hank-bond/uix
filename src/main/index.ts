// UIX cockpit — main process.
//
// Owns app lifecycle, creates the BrowserWindow, and registers the IPC
// channels declared in src/shared/ipc.ts.
//
// All registrations (IPC handlers, app events, window events) flow
// through the helpers in src/main/lifecycle.ts and land in a single
// `appBag`. One dispose on `will-quit` tears the whole tree down.
// See docs/conventions.md.

import { app, BrowserWindow } from "electron";
import { join } from "node:path";
import process from "node:process";

import {
  type AgentEvent,
  type CanvasChanged,
  Channels,
  type PromptRequest,
  type ReloadResult,
} from "../shared/ipc";
import { assertCanvasKey } from "../shared/canvas";

import { createAgentDriver } from "./agent/driver";
import { createCanvasAgentBinding } from "./canvas/agent-binding";
import { registerCanvasProtocol } from "./canvas/protocol";
import { loadExtensions } from "./extensions/loader";
import { defaultRoots } from "./extensions/roots";
import {
  DisposableBag,
  handle,
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
  if (win && !win.isDestroyed()) {
    win.webContents.send(Channels.agentEvent, event);
  }
}

function sendCanvasChanged(key: string): void {
  createLogger("canvas").info({ key }, "canvas_changed");
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send(Channels.canvasChanged, { key });
    }
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

  appBag.add(registerCanvasProtocol());

  // Extensions live under their own child scope so reload can tear
  // down the extension subtree without touching app-lifetime process
  // handlers, the window, the agent driver, or IPC registrations.
  const roots = defaultRoots();
  const extensionsBag = appBag.add(new DisposableBag());
  const { loaded, failed } = await loadExtensions(roots, extensionsBag);
  createLogger("extensions").info(
    { loaded: loaded.length, failed: failed.length },
    "activation_complete",
  );

  let mainWindow: BrowserWindow | null = createWindow();
  appBag.add(
    onWindow(mainWindow, "closed", () => {
      mainWindow = null;
    }),
  );

  const driver = createAgentDriver({
    onEvent: (event) => sendAgentEvent(mainWindow, event),
    agentBindings: [
      createCanvasAgentBinding({
        onCanvasChanged: sendCanvasChanged,
      }),
    ],
  });
  appBag.add(driver);

  appBag.add(
    handle<PromptRequest, void>(Channels.prompt, (req) => {
      // Fire and forget — the renderer subscribes to the event stream,
      // and `invoke` resolves once the prompt has been accepted.
      void driver.prompt(req.text);
    }),
  );

  appBag.add(
    handle<CanvasChanged, void>(Channels.canvasRefresh, (req) => {
      assertCanvasKey(req.key);
      sendCanvasChanged(req.key);
    }),
  );

  appBag.add(
    handle<void, ReloadResult>(Channels.reload, async () => {
      const reloadLog = createLogger("main");
      reloadLog.info({}, "reload_started");

      try {
        const extensionResult = await loadExtensions(roots, extensionsBag);
        const piReloaded = await driver.reload();
        reloadLog.info(
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
