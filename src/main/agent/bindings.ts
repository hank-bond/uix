// UIX cockpit — internal agent bindings.
//
// Core UIX subsystems bind their agent-facing surface here. This is not the
// user extension contribution path: these bindings are substrate-owned and may
// use cockpit internals directly. Stage 1 collected tools; per-turn context
// contribution joins it here. Prompt sections, hooks, and message transforms
// can be added to this shape when they land.

import type { ToolDefinition } from "@earendil-works/pi-coding-agent";

export interface AgentBinding {
  tools?: ToolDefinition[];
  // Returned string is prepended to the next user turn's prompt before it reaches
  // pi — the high-level (customTools-path) context seam. null contributes nothing.
  contextForTurn?(): Promise<string | null>;
}

export function collectAgentBindingTools(
  bindings: readonly AgentBinding[],
): ToolDefinition[] {
  const tools: ToolDefinition[] = [];
  const seen = new Set<string>();

  for (const binding of bindings) {
    for (const tool of binding.tools ?? []) {
      if (seen.has(tool.name)) {
        throw new Error(`Duplicate core agent tool registered: ${tool.name}`);
      }
      seen.add(tool.name);
      tools.push(tool);
    }
  }

  return tools;
}

// Gather each binding's per-turn context block, in binding order. Returns null
// when nothing contributes, so the driver can leave the prompt untouched.
export async function collectAgentBindingContext(
  bindings: readonly AgentBinding[],
): Promise<string | null> {
  const blocks: string[] = [];
  for (const binding of bindings) {
    const block = await binding.contextForTurn?.();
    if (block) blocks.push(block);
  }
  return blocks.length ? blocks.join("\n\n") : null;
}
