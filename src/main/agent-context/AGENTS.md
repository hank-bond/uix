---
summary: "Agent context assembles feature-provided state into structured messages that Pi sends to the model before a run."
---

# Agent context

Feature activation passes declarations from `packages/api/src/agent-context.ts` through pure resolution before registry acceptance. Acceptance is the only transition that creates substrate-owned update or append buffers and returns their live capabilities. Materialized contributions retain ownership of their external state.

The agent runtime controls when it assembles accepted contributions against branch history and commits them before a run.

## Contents

<!-- INDEX:START -->

<!-- Generated from production source-file summaries, local Markdown frontmatter, and child AGENTS.md summaries. Do not edit by hand; run `npm run docs:index`. -->

### Source files

- **[registry.ts](./registry.ts)** Accumulates feature-provided context and assembles the state message that Pi sends to the model before a run.
- **[resolution.ts](./resolution.ts)** Checks feature and contribution names and derives the stable IDs used in agent-context messages.

<!-- INDEX:END -->
