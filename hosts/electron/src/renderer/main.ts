// Mounts the shared workspace client over the Electron preload adapter.

import { mountWorkspaceClient } from "@uix/client/workspace";

import { createAttachmentWebRootsObservable } from "./attachment-web-roots";
import { createElectronActionInvocationSource } from "./electron-action-invocation-source";
import { createElectronWorkspaceClient } from "./electron-workspace-client";

const target = document.getElementById("root");
if (!target) throw new Error("#root not found");

const lifetime = new DisposableStack();
window.addEventListener(
  "pagehide",
  () => {
    lifetime.dispose();
  },
  { once: true },
);

async function mountWorkspace(target: HTMLElement): Promise<void> {
  const roots = lifetime.use(
    createAttachmentWebRootsObservable(window.attachmentWebBinding),
  );
  await roots.ready;
  if (lifetime.disposed) return;
  lifetime.use(
    mountWorkspaceClient({
      target,
      client: createElectronWorkspaceClient(window.channels),
      attachmentWebRootsObservable: roots,
      actionInvocationSource: createElectronActionInvocationSource(
        window.channels,
      ),
    }),
  );
}

void mountWorkspace(target).catch((error: unknown) => {
  if (lifetime.disposed) return;
  lifetime.dispose();
  target.textContent = "Workspace bootstrap failed.";
  console.error({ error }, "workspace_bootstrap_failed");
});
