---
summary: "Agent tools give each feature safe Pi tool names, reject duplicates, and install the accepted tools for each agent runtime."
---

# Agent tools

Feature activation passes declarations from `packages/api/src/agent-tools.ts` through pure name resolution before registry acceptance. Ordinary tools must enter through owner-scoped resolution. Only the explicit override contribution path may retain an exact Pi name.

Registry acceptance defines the live collision domain, and the agent runtime installs a snapshot of accepted definitions into each Pi runtime generation.

## Contents

<!-- INDEX:START -->

<!-- Generated from production source-file summaries, local Markdown frontmatter, and child AGENTS.md summaries. Do not edit by hand; run `npm run docs:index`. -->

### Source files

- **[registry.ts](./registry.ts)** Retains accepted feature tools, rejects duplicate Pi names, and installs a snapshot into each Pi runtime.
- **[resolution.ts](./resolution.ts)** Checks feature tool names and assigns the Pi name and contribution ID used by the registry.

<!-- INDEX:END -->
