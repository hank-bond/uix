---
summary: "The Electron main process composes application and window lifetimes, workspace and feature runtimes, substrate registries, IPC, and agent sessions."
status: active
---

# Main process

This directory owns the trusted Electron process and composes the cockpit's live runtime. `index.ts` is the application composition root: concrete services do not enroll themselves, and cleanup-producing bindings join explicit application, workspace, window, feature, or agent lifetimes through `lifecycle.ts`.

[`workspace/`](./workspace/AGENTS.md) owns workspace identity, durable manifest adoption, settings binding, and replacement coordination. [`features/`](./features/AGENTS.md) owns manifest-selected feature activation and surface delivery. Agent runtime code owns Pi sessions and restoration, while the direct registry files at this level provide substrate facets shared by feature activation and the composition root.

IPC remains a transport boundary rather than a feature contract boundary. Shared author contracts live under `src/api`; the channel and resource registries bind resolved contributions to transports supplied by the main-process composition.

## Contents

<!-- INDEX:START -->

<!-- Generated from production source-file summaries, local Markdown frontmatter, and child AGENTS.md summaries. Do not edit by hand; run `npm run docs:index`. -->

### Directories

- **[features/](./features/AGENTS.md)** _(active)._ The main-process feature runtime validates manifest composition, activates feature instances atomically, registers facets, builds surfaces, and scaffolds editable workspaces.
- **[workspace/](./workspace/AGENTS.md)** _(active)._ Workspace runtime code resolves workspace identity, adopts durable manifest generations, binds settings, and coordinates whole-workspace replacement.

### Source files

- **[agent-skill-registry.ts](./agent-skill-registry.ts)** Resolves and registers feature-supplied Pi skill paths for runtime resource discovery.
- **[agent-system-prompt-registry.ts](./agent-system-prompt-registry.ts)** Registers ordered feature-owned system-prompt sections and assembles their runtime Markdown.
- **[channel-registry.ts](./channel-registry.ts)** Owns live channel request registrations and feature-scoped event publication over an injected transport.
- **[document-store.ts](./document-store.ts)** Persists mutable document content and immutable metadata-bearing versions behind namespace and document identifiers.
- **[external-links.ts](./external-links.ts)** Keeps renderer navigation contained while delegating approved web URLs to the operating system.
- **[index.ts](./index.ts)** Composes and owns the Electron application, workspace, window, feature, and agent runtime lifetimes.
- **[ipc-wire-log.ts](./ipc-wire-log.ts)** Records one IPC crossing to terminal and optional file loggers under caller-owned payload policy.
- **[ipc.ts](./ipc.ts)** Owns the renderer-to-main request and main-to-renderer event transport boundary.
- **[lifecycle.ts](./lifecycle.ts)** Couples main-process registrations to deterministic application, window, and component lifetimes.
- **[log.ts](./log.ts)** Creates component-attributed structured loggers with environment-appropriate output.
- **[recents.ts](./recents.ts)** Persists a bounded newest-first list of workspace manifests that still exist.
- **[resource-registry.ts](./resource-registry.ts)** Owns live feature resource routes and dispatches validated resource URLs through one protocol transport.
- **[settings-registry.ts](./settings-registry.ts)** Owns live schema-validated settings scopes and change routing with persistence externally injected.
- **[turn-state.ts](./turn-state.ts)** Owns branch-scoped, model-hidden feature state registration, delta commits, projection, history, and restoration.

<!-- INDEX:END -->
