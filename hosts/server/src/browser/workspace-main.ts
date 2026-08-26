// Boots the stateless workspace shell and owns its live session connection.

import { connectWorkspacePage } from "./workspace-connection";

const connection = connectWorkspacePage();
window.addEventListener(
  "pagehide",
  () => {
    connection[Symbol.dispose]();
  },
  { once: true },
);
