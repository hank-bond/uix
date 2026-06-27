// preload.
//
// Sandboxed + contextIsolated. The renderer never sees `ipcRenderer`
// directly; it gets a typed surface on `window.uix` mirroring the
// contract in src/shared/ipc.ts.

import { contextBridge, ipcRenderer } from "electron";

import { toChannelCanonicalId } from "#shared/channel-normalization";
import {
  type AgentEvent,
  type CanvasChanged,
  type CanvasWriteback,
  Channels,
  type PromptRequest,
  type UIXBridge,
} from "../shared/ipc";

const CanvasChannels = {
  writeback: toChannelCanonicalId("canvas", "writeback"),
  changed: toChannelCanonicalId("canvas", "changed"),
} as const;

const bridge: UIXBridge = {
  sendPrompt: (req: PromptRequest) => ipcRenderer.invoke(Channels.prompt, req),
  writebackCanvas: (req: CanvasWriteback) =>
    ipcRenderer.invoke(CanvasChannels.writeback, req),
  reload: () => ipcRenderer.invoke(Channels.reload),
  getHistory: () => ipcRenderer.invoke(Channels.history),

  onAgentEvent: (handler) => {
    const listener = (_e: Electron.IpcRendererEvent, event: AgentEvent) =>
      handler(event);
    ipcRenderer.on(Channels.agentEvent, listener);
    return () => {
      ipcRenderer.off(Channels.agentEvent, listener);
    };
  },

  onCanvasChanged: (handler) => {
    const listener = (_e: Electron.IpcRendererEvent, event: CanvasChanged) =>
      handler(event);
    ipcRenderer.on(CanvasChannels.changed, listener);
    return () => {
      ipcRenderer.off(CanvasChannels.changed, listener);
    };
  },
};

// BrowserWindow preload is for the cockpit shell only. Agent-authored canvas
// iframes must not receive window.uix even if Electron ever loads this preload
// in a subframe.
if (process.isMainFrame) {
  contextBridge.exposeInMainWorld("uix", bridge);
}
