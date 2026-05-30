// Trellis cockpit — main process.
//
// Owns app lifecycle, creates the BrowserWindow, and registers the IPC
// channels declared in src/shared/ipc.ts. `trellis:prompt` is handed to
// the agent driver (src/main/agent.ts), which talks to pi and forwards
// events back to the renderer via `trellis:agent-event`.

import { app, BrowserWindow, ipcMain } from "electron";
import { join } from "node:path";

import { type AgentEvent, Channels, type PromptRequest } from "../shared/ipc";

import { type AgentDriver, createAgentDriver } from "./agent";

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

function registerIpc(
  getWindow: () => BrowserWindow | null,
  driver: AgentDriver,
): void {
  ipcMain.handle(Channels.prompt, async (_e, req: PromptRequest) => {
    const win = getWindow();
    if (!win) return;
    // Fire and forget — the renderer subscribes to the event stream,
    // and `invoke` resolves once the prompt has been accepted.
    void driver.prompt(req.text);
  });
}

function sendEvent(win: BrowserWindow | null, event: AgentEvent): void {
  if (win && !win.isDestroyed()) {
    win.webContents.send(Channels.agentEvent, event);
  }
}

app.whenReady().then(() => {
  let mainWindow: BrowserWindow | null = createWindow();
  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  const driver = createAgentDriver({
    onEvent: (event) => sendEvent(mainWindow, event),
  });

  registerIpc(() => mainWindow, driver);

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      mainWindow = createWindow();
      mainWindow.on("closed", () => {
        mainWindow = null;
      });
    }
  });

  app.on("will-quit", () => {
    void driver.dispose();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
