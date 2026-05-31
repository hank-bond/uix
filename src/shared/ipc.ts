// UIX cockpit — shared IPC contract.
//
// Channels are scoped under `uix:` so they don't collide with
// anything Electron or other libs might use. Renderer never imports
// `electron`; it only sees the surface exposed by the preload via
// contextBridge. These types describe that contract so both sides stay
// in sync.

/** Channel names. Keep this list small. */
export const Channels = {
  /** Renderer → main. invoke-style. Returns when the prompt has been accepted. */
  prompt: "uix:prompt",
  /** Main → renderer. webContents.send. Stream of agent events. */
  agentEvent: "uix:agent-event",
} as const;

/** Payload for `uix:prompt`. */
export interface PromptRequest {
  text: string;
}

/**
 * Agent events sent main → renderer.
 *
 * Today we only forward the bits the conversation pane needs to render
 * plain text streaming. Richer event types (tool calls, turn/agent
 * lifecycle, queue updates) get added as the cockpit grows into them.
 */
export type AgentEvent =
  | { type: "user_message"; text: string }
  | { type: "assistant_delta"; delta: string }
  | { type: "assistant_end" }
  | { type: "error"; message: string };

/** Shape exposed on `window.uix` by the preload. */
export interface UIXBridge {
  sendPrompt: (req: PromptRequest) => Promise<void>;
  onAgentEvent: (handler: (event: AgentEvent) => void) => () => void;
}
