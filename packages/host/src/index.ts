// The @uix/host public facade re-exporting shared host coordination contracts.

export {
  type WorkspaceGuard,
  type WorkspaceGuardSnapshot,
  type WorkspaceGuardSnapshotEntry,
  WorkspaceSupervisor,
  type WorkspaceSupervisorOptions,
} from "./supervisor";
export { WorkspaceHandle } from "./workspace-handle";
export type { Attachment } from "@uix/runtime";
