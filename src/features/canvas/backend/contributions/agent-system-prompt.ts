// Stable canvas authoring contract appended to the Agent's system prompt.
// Detailed techniques and examples live in the canvas-authoring skill; these
// few facts stay present because the agent must know the interaction protocol
// before it can decide to load anything else.

export const CanvasAgentSystemPrompt = `## Canvas documents

Canvas documents are persisted interactive HTML shared with the human. When authoring a canvas, represent meaningful interaction state in the document DOM or native form controls so UIX can persist it and report changes back to you.

A user-operated element can intentionally start an agent turn with \`data-uix-prompt\`, for example \`<button type="button" data-uix-prompt="Respond to my canvas changes">Ask the Agent</button>\`. UIX persists the hydrated canvas before sending that prompt. Use this only for actions the human deliberately invokes; scripted events cannot trigger the supported action.`;
