// preload.
//
// Sandboxed + contextIsolated. The renderer never sees `ipcRenderer`
// directly; it gets a typed surface on `window.channels` mirroring the
// contract in src/shared/ipc.ts.

import { contextBridge, ipcRenderer } from "electron";

import { Channels, type ChannelTransport } from "../shared/ipc";

const transport: ChannelTransport = {
  request: (name, payload) => ipcRenderer.invoke(name, payload),
  subscribe: (name, handler) => {
    const listener = (_e: Electron.IpcRendererEvent, payload: unknown) =>
      handler(payload);
    ipcRenderer.on(name, listener);
    return () => {
      ipcRenderer.off(name, listener);
    };
  },
  reload: () => ipcRenderer.invoke(Channels.reload),
};

// BrowserWindow preload is for the cockpit shell only. Agent-authored canvas
// iframes must not receive window.channels even if Electron ever loads this preload
// in a subframe.
if (process.isMainFrame) {
  contextBridge.exposeInMainWorld("channels", transport);
}
