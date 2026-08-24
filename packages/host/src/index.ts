// The @uix/host public facade re-exporting shared host coordination contracts.

export {
  assertWorkspaceCatalogId,
  parseWorkspaceCatalog,
  type WorkspaceCatalog,
  WorkspaceCatalogVersion,
} from "./catalog";
export {
  type WorkspaceGuard,
  type WorkspaceGuardSnapshot,
  type WorkspaceGuardSnapshotEntry,
  WorkspaceSupervisor,
  type WorkspaceSupervisorOptions,
} from "./supervisor";
export type { Workspace } from "./workspace";
export type { Attachment } from "@uix/runtime";
