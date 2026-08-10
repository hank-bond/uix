---
summary: "The `@uix/host` shared coordination: the workspace supervisor with single-flight boot and retention, the host-facing WorkspaceHandle, and the connection's attachment handle with scoped event routing."
read_when: "Writing shared host supervision code, or proving the host/runtime boundary in memory."
---

# Shared host coordination

This package holds the host-neutral coordination both concrete hosts compose. A supervisor maps workspace ids to single-flight boots. Workspace handles own one runtime each. Attachments bind connections to session targets and receive only the events the workspace router matches to them. The in-memory H2 suite exercises every contract with fake runtimes and agents. Concrete Electron and server code never enters this package.

## Contents

<!-- INDEX:START -->

<!-- Generated from production source-file summaries, local Markdown frontmatter, and child AGENTS.md summaries. Do not edit by hand; run `npm run docs:index`. -->

### Source files

- **[attachment.ts](./attachment.ts)** the connection's owned, retargetable attachment handle and its local
- **[index.ts](./index.ts)** the @uix/host public facade re-exporting shared host coordination contracts.
- **[supervisor.ts](./supervisor.ts)** host-level workspace supervision: id → single-flight boot → WorkspaceHandle,
- **[workspace-handle.ts](./workspace-handle.ts)** the host-facing WorkspaceHandle shape plus the local handle that routes

<!-- INDEX:END -->
