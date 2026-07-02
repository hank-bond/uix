// picker entry.
//
// App shell chrome, not workspace code: this page runs before any workspace
// is open, talks straight over the preload transport (no WorkspaceClient),
// and is replaced by the workspace window once a choice is made.

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { Picker } from "./Picker";

const rootEl = document.getElementById("root");
if (!rootEl) throw new Error("#root not found");

createRoot(rootEl).render(
  <StrictMode>
    <Picker />
  </StrictMode>,
);
