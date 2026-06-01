// UIX cockpit — preload.
//
// Sandboxed + contextIsolated. The renderer never sees `ipcRenderer`
// directly; it gets a typed surface on `window.uix` mirroring the
// contract in src/shared/ipc.ts.

import { contextBridge, ipcRenderer } from "electron";

import {
  type AgentEvent,
  type CanvasChanged,
  Channels,
  type PromptRequest,
  type UIXBridge,
} from "../shared/ipc";

const bridge: UIXBridge = {
  sendPrompt: (req: PromptRequest) => ipcRenderer.invoke(Channels.prompt, req),
  refreshCanvas: (req: CanvasChanged) =>
    ipcRenderer.invoke(Channels.canvasRefresh, req),
  reload: () => ipcRenderer.invoke(Channels.reload),

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
    ipcRenderer.on(Channels.canvasChanged, listener);
    return () => {
      ipcRenderer.off(Channels.canvasChanged, listener);
    };
  },
};

// BrowserWindow preload is for the cockpit shell only. Agent-authored canvas
// iframes must not receive window.uix even if Electron ever loads this preload
// in a subframe.
if (process.isMainFrame) {
  contextBridge.exposeInMainWorld("uix", bridge);
}
