// The @uix/runtime public facade re-exporting the workspace-runtime contract and its factory.

export type {
  AttachmentDispatchContext,
  CanonicalRequest,
  CanonicalResponse,
  PreparedDispatch,
  RequestError,
} from "./dispatch";
export type { EventScope, RuntimeEvent } from "./events";
export type { ActivationResult } from "./features/loader";
export {
  createWorkspaceRuntime,
  type WorkspaceRuntimeDependencies,
  type WorkspaceRuntimeOptions,
} from "./runtime";
export type {
  Attachment,
  AttachmentId,
  BranchId,
  CreatedAttachment,
  SessionId,
  SessionTarget,
  WorkspaceId,
  WorkspaceRuntime,
} from "./workspace";
export {
  toAttachmentId,
  toBranchId,
  toSessionId,
  toWorkspaceId,
} from "./workspace";
export type { ReloadResult } from "@uix/api/substrate-channels";
