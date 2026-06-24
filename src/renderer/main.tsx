// renderer entry.
// Mounts the React app into #root. Strict mode on; nothing else.
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { App } from "./App";
import { WorkspaceClientProvider } from "./workspace/context";
import { createPreloadWorkspaceClient } from "./workspace/preload";

const rootEl = document.getElementById("root");
if (!rootEl) throw new Error("#root not found in renderer index.html");

const workspaceClient = createPreloadWorkspaceClient(window.uix);

createRoot(rootEl).render(
  <StrictMode>
    <WorkspaceClientProvider client={workspaceClient}>
      <App />
    </WorkspaceClientProvider>
  </StrictMode>,
);
