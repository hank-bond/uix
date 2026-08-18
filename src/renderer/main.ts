// Boots the shared workspace client over the Electron preload adapter.

import { mountWorkspaceClient } from "@uix/client/workspace";

import { createElectronWorkspaceClient } from "./electron-workspace-client";

const target = document.getElementById("root");
if (!target) throw new Error("#root not found");

const mounted = mountWorkspaceClient({
  target,
  client: createElectronWorkspaceClient(window.channels),
});
window.addEventListener(
  "pagehide",
  () => {
    mounted[Symbol.dispose]();
  },
  { once: true },
);
