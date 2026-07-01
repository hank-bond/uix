// host entry.
//
// At W2 this mirrors src/renderer/main.tsx but renders Host instead of App.
// The running app still uses main.tsx until W3.

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { Host } from "./host/Host";
import { WorkspaceClientProvider } from "./workspace/context";
import { createPreloadWorkspaceClient } from "./workspace/preload";

const rootEl = document.getElementById("root");
if (!rootEl) throw new Error("#root not found in host.html");

const workspaceClient = createPreloadWorkspaceClient(window.uix);

createRoot(rootEl).render(
  <StrictMode>
    <WorkspaceClientProvider client={workspaceClient}>
      <Host />
    </WorkspaceClientProvider>
  </StrictMode>,
);
