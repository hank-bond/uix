// UIX cockpit — internal agent bindings.
//
// Core UIX subsystems bind their agent-facing surface here. This is not the
// user extension contribution path: these bindings are substrate-owned and may
// use cockpit internals directly. Stage 1 only collects tools; prompt sections,
// hooks, message transforms, and context providers can be added to this shape
// when they land.

import type { ToolDefinition } from "@earendil-works/pi-coding-agent";

export interface AgentBinding {
  tools?: ToolDefinition[];
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
