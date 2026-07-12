// UIX-owned system-prompt assembly.
//
// Prompt-producing facets remain separate public concepts. This is their one
// Pi-facing adapter: when an extension runtime starts/reloads, it computes one
// deterministic suffix after all features have registered. before_agent_start
// appends that unchanged suffix to Pi's stored base prompt for each run.

import type { AgentInstaller } from "./installers";

export type SystemPromptSectionSource = () => string | undefined;

export function createSystemPromptAssembler(
  sources: readonly SystemPromptSectionSource[],
): AgentInstaller {
  return (pi) => {
    const sections = sources
      .map((source) => source()?.trim())
      .filter((section): section is string => Boolean(section));
    if (sections.length === 0) return;

    const suffix = sections.join("\n\n");
    pi.on("before_agent_start", (event) => ({
      systemPrompt: `${event.systemPrompt}\n\n${suffix}`,
    }));
  };
}
