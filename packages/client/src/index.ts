// Public browser-client entrypoints and host adapter contracts.

export {
  type LauncherActionOutcome,
  type LauncherAdapter,
  type LauncherClientMountOptions,
  type LauncherWorkspace,
  mountLauncherClient,
} from "./launcher";
export {
  type AttachmentWebRootsObservable,
  type AttachmentWebRootsSnapshot,
  mountWorkspaceClient,
  type SessionLocationAdapter,
  type WorkspaceClientMountOptions,
} from "./workspace";
