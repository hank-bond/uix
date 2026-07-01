// host shell.
//
// At W2 this is a thin pass-through rendering the Workspace flat. At W3 it
// will render Workspace inside a Host-owned iframe and bridge the
// WorkspaceClient transport over postMessage.

import { Workspace } from "../workspace/Workspace";

export function Host() {
  return <Workspace />;
}
