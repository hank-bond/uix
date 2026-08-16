---
summary: "The `@uix/host` shared coordination: workspace supervision, private supervised-workspace ownership, narrow workspace handles, and scoped delivery to runtime-created attachments."
read_when: "Writing shared host supervision code, or proving the host/runtime boundary in memory."
---

# Shared host coordination

This package holds the host-neutral coordination both concrete hosts compose. A `WorkspaceSupervisor` maps workspace ids to single-flight boots and issues independent `WorkspaceGuard`s. Each generic guard protects one private `WorkspaceOwnership` and provides its operational `Workspace` surface without lifecycle authority. That ownership controls one runtime, its attachment delivery records, and teardown. It selects matching attachments for scoped events but holds only their delivery closures. An in-memory suite exercises every contract with fake runtimes and agents. Concrete Electron and server code never enters this package.

## Contents

<!-- INDEX:START -->

<!-- Generated from production source-file summaries, local Markdown frontmatter, and child AGENTS.md summaries. Do not edit by hand; run `npm run docs:index`. -->

### Source files

- **[index.ts](./index.ts)** The @uix/host public facade re-exporting shared host coordination contracts.
- **[supervisor.ts](./supervisor.ts)** Supervises workspace-keyed runtimes and issues independent workspace guards.
- **[workspace.ts](./workspace.ts)** Host-level workspace operations and supervisor-only lifecycle authority.

<!-- INDEX:END -->
