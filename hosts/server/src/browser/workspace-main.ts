// Opens the workspace page and mounts its shared client after initial connection acceptance.

import { mountWorkspaceClient } from "@uix/client";

import { openWorkspacePage } from "./workspace-page";

const target = document.getElementById("root");
if (!target) throw new Error("#root not found");

const workspacePage = openWorkspacePage({
  readyHandler: ({
    client,
    sessionLocationAdapter,
    attachmentWebRootsObservable,
  }) => {
    const status = document.getElementById("status");
    if (status) status.hidden = true;
    return mountWorkspaceClient({
      target,
      client,
      sessionLocationAdapter,
      attachmentWebRootsObservable,
    });
  },
});
window.addEventListener(
  "pagehide",
  () => {
    workspacePage[Symbol.dispose]();
  },
  { once: true },
);
