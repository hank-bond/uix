// Boots the shared launcher client over the server catalog and browser navigation adapter.

import { mountLauncherClient } from "@uix/client/launcher";

import { createServerLauncherAdapter } from "./launcher-adapter";

const target = document.getElementById("root");
if (!target) throw new Error("#root not found");

const mounted = mountLauncherClient({
  target,
  adapter: createServerLauncherAdapter({
    readCatalog: async () => {
      const response = await fetch("/api/catalog", {
        headers: { Accept: "application/json" },
      });
      if (!response.ok) {
        throw new Error(`Catalog request failed: ${String(response.status)}`);
      }
      return response.json() as Promise<unknown>;
    },
    setLocation: (location) => {
      window.location.assign(location);
    },
  }),
});
window.addEventListener(
  "pagehide",
  () => {
    mounted[Symbol.dispose]();
  },
  { once: true },
);
