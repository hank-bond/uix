// the `@uix/runtime` public facade.
//
// The host-neutral workspace runtime: one composition root that instantiates
// a workspace's substrate over host-supplied transport ports. Hosts (Electron
// today, server later) import `createWorkspaceRuntime` and provide the
// channel/resource transports plus capabilities.

export { WorkspaceManifestFileName } from "./features/manifest";
export {
  type ScaffoldOptions,
  type ScaffoldResult,
  scaffoldWorkspace,
} from "./features/scaffold";
export {
  disposable,
  DisposableBag,
  installProcessHandlers,
  onAbort,
  subscribe,
} from "./lifecycle";
export { createLogger, type Logger } from "./log";
export type { ResourceTransportRegistrar } from "./resource-registry";
export {
  type ChannelTransportPort,
  createWorkspaceRuntime,
  type WorkspaceRuntime,
  type WorkspaceRuntimeCapabilities,
  type WorkspaceRuntimePorts,
} from "./runtime";
export { resolveWorkspace, type Workspace } from "./workspace/roots";
