---
summary: "Agent context separates pure feature-owned identity resolution from live buffering and model-visible state-message assembly."
status: active
---

# Agent context

Feature activation passes declarations from `src/api/agent-context.ts` through pure resolution before registry acceptance. Acceptance is the only transition that creates substrate-owned update or append buffers and returns their live capabilities; materialized contributions retain ownership of their external state.

The agent runtime controls when accepted contributions are assembled against branch history and committed before a run.

## Contents

<!-- INDEX:START -->

<!-- Generated from production source-file summaries, local Markdown frontmatter, and child AGENTS.md summaries. Do not edit by hand; run `npm run docs:index`. -->

### Source files

- **[registry.ts](./registry.ts)** Registers feature context, manages optional buffers, and assembles model-visible state messages against branch history.
- **[resolution.ts](./resolution.ts)** Derives owner-scoped canonical and contribution identities without creating live agent-context state.

<!-- INDEX:END -->
