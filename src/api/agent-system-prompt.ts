// A stable feature-owned section appended to the Agent's system prompt.
//
// The contribution is deliberately one opaque Markdown blob per feature.
// Changing/per-turn information belongs in agentContext; detailed optional
// workflows belong in agentSkills.

export type AgentSystemPromptContribution = string;
