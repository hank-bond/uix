// Boots the shared workspace client over one server-owned WebSocket.

import { mountWorkspaceClient } from "@uix/client";

import { openWorkspaceWebSocket } from "./workspace-websocket";

const target = document.getElementById("root");
if (!target) throw new Error("#root not found");

const workspaceWebSocket = openWorkspaceWebSocket({
  readyHandler: ({ client, synchronizeSessionLocation }) => {
    const status = document.getElementById("status");
    if (status) status.hidden = true;
    return mountWorkspaceClient({
      target,
      client,
      synchronizeSessionLocation,
    });
  },
});
window.addEventListener(
  "pagehide",
  () => {
    workspaceWebSocket[Symbol.dispose]();
  },
  { once: true },
);
