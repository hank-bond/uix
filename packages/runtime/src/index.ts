// the @uix/runtime public facade re-exporting the workspace-runtime contract.

export type {
  AttachmentContext,
  CanonicalRequest,
  CanonicalResponse,
  RequestError,
} from "./dispatch";
export type { EventScope, RuntimeEvent } from "./events";
export type {
  AgentInstanceId,
  AttachmentId,
  RuntimeAttachment,
  SessionId,
  SessionTarget,
  WorkspaceId,
  WorkspaceRuntime,
} from "./workspace";
export {
  toAgentInstanceId,
  toAttachmentId,
  toSessionId,
  toWorkspaceId,
} from "./workspace";
