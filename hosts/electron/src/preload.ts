// Exposes channel traffic and attachment-binding control to sandboxed main-frame renderer pages.
//
// Sandboxed + contextIsolated. The renderer never sees `ipcRenderer`
// directly. It gets a typed surface on `window.channels` mirroring the
// contract in the Electron host channel-transport.ts.

import { contextBridge, ipcRenderer } from "electron";

import {
  type AttachmentWebBindingTransport,
  Channels,
  type ChannelTransport,
  parseAttachmentWebBindingSnapshot,
} from "./channel-transport";

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

const attachmentWebBinding: AttachmentWebBindingTransport = {
  read: async () =>
    parseAttachmentWebBindingSnapshot(
      await ipcRenderer.invoke(Channels.webBindingRead),
    ),
  subscribe: (snapshotListener) => {
    const listener = (
      _event: Electron.IpcRendererEvent,
      snapshot: unknown,
    ): void => {
      snapshotListener(parseAttachmentWebBindingSnapshot(snapshot));
    };
    ipcRenderer.on(Channels.webBindingChanged, listener);
    return () => ipcRenderer.off(Channels.webBindingChanged, listener);
  },
};

// BrowserWindow preload is for the host shell only. Agent-authored canvas
// iframes must not receive window.channels even if Electron ever loads this preload
// in a subframe.
if (process.isMainFrame) {
  contextBridge.exposeInMainWorld("channels", transport);
  contextBridge.exposeInMainWorld("attachmentWebBinding", attachmentWebBinding);
}
