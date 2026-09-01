// Exposes the typed channel transport on `window.channels` for sandboxed renderer pages.
//
// Sandboxed + contextIsolated. The renderer never sees `ipcRenderer`
// directly. It gets a typed surface on `window.channels` mirroring the
// contract in the Electron host channel-transport.ts.

import { contextBridge, ipcRenderer } from "electron";

import { Channels, type ChannelTransport } from "./channel-transport";

const transport: ChannelTransport = {
  request: (channel, payload) =>
    ipcRenderer.invoke(Channels.request, { channel, payload }),
  subscribe: (channel, handler) => {
    const listener = (
      _e: Electron.IpcRendererEvent,
      payload: unknown,
    ): void => {
      handler(payload);
    };
    ipcRenderer.on(channel, listener);
    return () => {
      ipcRenderer.off(channel, listener);
    };
  },
};

// BrowserWindow preload is for the host shell only. Agent-authored canvas
// iframes must not receive window.channels even if Electron ever loads this preload
// in a subframe.
if (process.isMainFrame) {
  contextBridge.exposeInMainWorld("channels", transport);
}
