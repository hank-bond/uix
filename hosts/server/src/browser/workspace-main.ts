// Boots the stateless workspace shell and owns its live session connection.

import { openWorkspaceConnection } from "./workspace-connection";

const connection = openWorkspaceConnection();
window.addEventListener(
  "pagehide",
  () => {
    connection[Symbol.dispose]();
  },
  { once: true },
);
