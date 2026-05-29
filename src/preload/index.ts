// Trellis cockpit — preload.
//
// Sandboxed + contextIsolated. The renderer never sees `ipcRenderer`
// directly; it gets a typed surface on `window.trellis` mirroring the
// contract in src/shared/ipc.ts.

import { contextBridge, ipcRenderer } from "electron";

import {
  type AgentEvent,
  Channels,
  type PromptRequest,
  type TrellisBridge,
} from "../shared/ipc";

const bridge: TrellisBridge = {
  sendPrompt: (req: PromptRequest) => ipcRenderer.invoke(Channels.prompt, req),

  onAgentEvent: (handler) => {
    const listener = (_e: Electron.IpcRendererEvent, event: AgentEvent) =>
      handler(event);
    ipcRenderer.on(Channels.agentEvent, listener);
    return () => {
      ipcRenderer.off(Channels.agentEvent, listener);
    };
  },
};

contextBridge.exposeInMainWorld("trellis", bridge);
