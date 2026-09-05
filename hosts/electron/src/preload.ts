// Provides host communication capabilities only to sandboxed main-frame pages.
//
// Context isolation prevents the renderer from accessing the `ipcRenderer`
// object directly. Preload provides typed capabilities without granting
// authored iframes access to host communication.

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

// Authored iframes must not receive either capability, even if Electron loads
// this preload in a subframe.
if (process.isMainFrame) {
  contextBridge.exposeInMainWorld("channels", transport);
  contextBridge.exposeInMainWorld("attachmentWebBinding", attachmentWebBinding);
}
