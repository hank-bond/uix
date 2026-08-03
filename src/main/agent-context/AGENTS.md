---
summary: "Agent context separates pure feature-owned identity resolution from live buffering and model-visible state-message assembly."
status: active
---

# Agent context

This directory owns the transition from feature-authored agent-context declarations to live model-visible state. Author contracts remain under `src/api/agent-context.ts`; feature activation registers contributions, and the agent runtime controls when assembled context is committed before a run.

`resolution.ts` derives owner-scoped contribution and canonical ids without creating live state. `registry.ts` accepts those resolved values, adds substrate-owned state only for update and append buffers, and assembles all active sections against branch history. Keep that lifecycle boundary explicit: resolution remains pure, while registry membership and returned capabilities define liveness.

## Contents

<!-- INDEX:START -->

<!-- Generated from production source-file summaries, local Markdown frontmatter, and child AGENTS.md summaries. Do not edit by hand; run `npm run docs:index`. -->

### Source files

- **[registry.ts](./registry.ts)** Registers feature context, manages optional buffers, and assembles model-visible state messages against branch history.
- **[resolution.ts](./resolution.ts)** Derives owner-scoped canonical and contribution identities without creating live agent-context state.

<!-- INDEX:END -->
