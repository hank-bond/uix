// Trellis cockpit — main process.
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

import { type AgentEvent, Channels, type PromptRequest } from "../shared/ipc";

import { createAgentDriver } from "./agent";
import { DisposableBag, handle, onApp, onWindow } from "./lifecycle";

const isDev = !app.isPackaged;

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1100,
    height: 720,
    title: "Trellis",
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

function sendEvent(win: BrowserWindow | null, event: AgentEvent): void {
  if (win && !win.isDestroyed()) {
    win.webContents.send(Channels.agentEvent, event);
  }
}

app.whenReady().then(() => {
  // One bag for everything that lives as long as the app does.
  // Anything we register goes in here; `will-quit` disposes it.
  const appBag = new DisposableBag();

  let mainWindow: BrowserWindow | null = createWindow();
  appBag.add(
    onWindow(mainWindow, "closed", () => {
      mainWindow = null;
    }),
  );

  const driver = createAgentDriver({
    onEvent: (event) => sendEvent(mainWindow, event),
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

  // Dispose the whole tree on shutdown. Registered raw (not via
  // onApp) because this is a one-shot process-end event with no
  // useful moment to remove it.
  app.on("will-quit", () => {
    appBag[Symbol.dispose]();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
