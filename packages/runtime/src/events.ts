// explicitly scoped runtime events: workspace, session, or agent-instance
// delivery. A transport can optimize subscription mechanics without redefining
// scope. The host routes each event only to matching attachments. There is no
// workspace-wide broadcast semantic.

import type { AgentInstanceId, SessionId } from "./workspace";

export type EventScope =
  | { readonly kind: "workspace" }
  | { readonly kind: "session"; readonly sessionId: SessionId }
  | { readonly kind: "agent-instance"; readonly instanceId: AgentInstanceId };

export interface RuntimeEvent {
  /** Stable event id, unique within the emitting runtime. */
  readonly id: string;
  readonly scope: EventScope;
  readonly payload: unknown;
}
