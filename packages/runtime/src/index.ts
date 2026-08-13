// The @uix/runtime public facade re-exporting the workspace-runtime contract and its factory.

export type {
  AttachmentContext,
  CanonicalRequest,
  CanonicalResponse,
  RequestError,
} from "./dispatch";
export type { EventScope, RuntimeEvent } from "./events";
export type { ActivationResult } from "./features/loader";
export {
  createWorkspaceRuntime,
  type WorkspaceChannelTransportDependencies,
  type WorkspaceRuntimeDependencies,
  type WorkspaceRuntimeOptions,
} from "./runtime";
export type {
  AttachmentId,
  BranchId,
  RuntimeAttachment,
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
