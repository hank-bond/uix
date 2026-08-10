---
summary: "The `@uix/runtime` contract surface: ids, the canonical dispatch envelope, scoped event types, and the exactly-one-workspace runtime interface the host supervisor composes."
read_when: "Implementing the workspace runtime (H3), or changing the boundary the host composes."
---

# Workspace runtime contracts

This package owns the runtime-facing contract, not the implementation. H2 defines the smallest executable shape and proves it against fakes. H3 ports the real substrate out of `src/main` behind it. The host imports this package and provides the runtime's dependencies as adapters. Nothing here imports a concrete host, and the envelope carries no transport or tenancy fields.

## Contents

<!-- INDEX:START -->

<!-- Generated from production source-file summaries, local Markdown frontmatter, and child AGENTS.md summaries. Do not edit by hand; run `npm run docs:index`. -->

### Source files

- **[dispatch.ts](./dispatch.ts)** canonical channel request/response envelope and host-stamped attachment
- **[events.ts](./events.ts)** explicitly scoped runtime events: workspace, session, or agent-instance
- **[index.ts](./index.ts)** the @uix/runtime public facade re-exporting the workspace-runtime contract.
- **[workspace.ts](./workspace.ts)** the workspace-runtime contract: ids, session targets, and the

<!-- INDEX:END -->
