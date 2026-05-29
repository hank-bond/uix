// Trellis cockpit — main process.
//
// Registers the IPC channels declared in src/shared/ipc.ts. The prompt
// handler currently echoes the input back as a stream of
// `assistant_delta` events; it will be replaced by a real agent session
// once the runtime is wired in.

import { app, BrowserWindow, ipcMain } from "electron";
import { join } from "node:path";

import {
  type AgentEvent,
  Channels,
  type PromptRequest,
} from "../shared/ipc";

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

/**
 * Stand-in for the real agent runtime. Splits the prompt into a few
 * chunks and pushes them back as `assistant_delta` events so the
 * renderer can prove its subscription pipeline works.
 */
async function echoStream(
  win: BrowserWindow,
  text: string,
): Promise<void> {
  const send = (event: AgentEvent) => {
    if (!win.isDestroyed()) win.webContents.send(Channels.agentEvent, event);
  };

  send({ type: "user_message", text });

  const reply = `echo: ${text}`;
  const chunks = reply.match(/.{1,8}/g) ?? [reply];
  for (const chunk of chunks) {
    await new Promise((r) => setTimeout(r, 40));
    send({ type: "assistant_delta", delta: chunk });
  }
  send({ type: "assistant_end" });
}

function registerIpc(getWindow: () => BrowserWindow | null): void {
  ipcMain.handle(Channels.prompt, async (_e, req: PromptRequest) => {
    const win = getWindow();
    if (!win) return;
    // Fire and forget — the renderer subscribes to the event stream;
    // `invoke` resolves once the prompt has been accepted.
    void echoStream(win, req.text);
  });
}

app.whenReady().then(() => {
  let mainWindow: BrowserWindow | null = createWindow();
  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  registerIpc(() => mainWindow);

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      mainWindow = createWindow();
      mainWindow.on("closed", () => {
        mainWindow = null;
      });
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
