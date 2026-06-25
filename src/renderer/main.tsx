// renderer entry.
// Mounts the React app into #root. Strict mode on; nothing else.
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { App } from "./App";

const rootEl = document.getElementById("root");
if (!rootEl) throw new Error("#root not found in renderer index.html");

createRoot(rootEl).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
