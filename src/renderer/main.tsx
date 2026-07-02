// renderer entry.
//
// One BrowserWindow = one workspace. The workspace client wraps window.uix
// directly — no iframe, no bridge, no sandbox. Multi-workspace isolation is
// at the BrowserWindow layer.

// Must run before any surface module can load: populates the shared-module
// global that bundled surfaces resolve react/typebox/@uix/api against.
import "./workspace/provide-shared-modules";

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { Workspace } from "./workspace/Workspace";
import { WorkspaceClientProvider } from "@uix/api/workspace";
import { createPreloadWorkspaceClient } from "./workspace/preload";

const rootEl = document.getElementById("root");
if (!rootEl) throw new Error("#root not found");

const workspaceClient = createPreloadWorkspaceClient(window.channels);

createRoot(rootEl).render(
  <StrictMode>
    <WorkspaceClientProvider client={workspaceClient}>
      <Workspace />
    </WorkspaceClientProvider>
  </StrictMode>,
);
