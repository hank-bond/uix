// Boots the shared launcher client over the Electron preload adapter.

import { mountLauncherClient } from "@uix/client/launcher";

import { createElectronLauncherAdapter } from "./electron-launcher-adapter";

const target = document.getElementById("root");
if (!target) throw new Error("#root not found");

const mounted = mountLauncherClient({
  target,
  adapter: createElectronLauncherAdapter(window.channels),
});
window.addEventListener(
  "pagehide",
  () => {
    mounted[Symbol.dispose]();
  },
  { once: true },
);
