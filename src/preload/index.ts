// UIX cockpit — preload.
//
// Sandboxed + contextIsolated. The renderer never sees `ipcRenderer`
// directly; it gets a typed surface on `window.uix` mirroring the
// contract in src/shared/ipc.ts.

import { contextBridge, ipcRenderer } from "electron";

import {
  type AgentEvent,
  Channels,
  type PromptRequest,
  type UIXBridge,
} from "../shared/ipc";

const bridge: UIXBridge = {
  sendPrompt: (req: PromptRequest) => ipcRenderer.invoke(Channels.prompt, req),
  reload: () => ipcRenderer.invoke(Channels.reload),

  onAgentEvent: (handler) => {
    const listener = (_e: Electron.IpcRendererEvent, event: AgentEvent) =>
      handler(event);
    ipcRenderer.on(Channels.agentEvent, listener);
    return () => {
      ipcRenderer.off(Channels.agentEvent, listener);
    };
  },
};

contextBridge.exposeInMainWorld("uix", bridge);
