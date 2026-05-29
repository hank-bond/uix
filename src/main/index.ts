// Trellis cockpit — main process.
// electron-vite injects MAIN_WINDOW_VITE_DEV_SERVER_URL-style env at dev time;
// we read it via process.env.ELECTRON_RENDERER_URL which electron-vite sets.

import { app, BrowserWindow } from "electron";
import { join } from "node:path";

const isDev = !app.isPackaged;

function createWindow(): void {
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
}

app.whenReady().then(() => {
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
