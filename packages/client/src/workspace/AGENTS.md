---
summary: "The shared workspace client hosts runtime surfaces and owns session, action, and keybinding projections over a host-constructed channel client."
---

# Workspace client

The workspace page is one browser composition behind `mountWorkspaceClient`. The surface host fetches the runtime composition and mounts each surface with feature-bound channels, settings, actions, scoped styles, and error isolation. Page-shared module installation preserves React, TypeBox, and `@uix/api` identity for runtime-built surfaces.

Actions resolve into one renderer registry and synchronize confirmed bindings through substrate channels. The session controller owns active-session projection and serializes session mutations without using selected-Agent activity as a mutation veto. An optional idempotent mount callback reflects accepted session selection into host-owned location encoding without participating in the mutation.

This directory contains no concrete transport, URL parser, Electron global, runtime implementation, or app feature import.

## Contents

<!-- INDEX:START -->

<!-- Generated from production source-file summaries, local Markdown frontmatter, and child AGENTS.md summaries. Do not edit by hand; run `npm run docs:index`. -->

### Source files

- **[action-binding-projection.ts](./action-binding-projection.ts)** Derives the action binding projection: resolved bindings, conflicts, and unresolved overrides per platform.
- **[action-context.tsx](./action-context.tsx)** Provides the action registry to the workspace and feature surfaces through React context.
- **[action-keyboard-dispatcher.tsx](./action-keyboard-dispatcher.tsx)** Binds keyboard shortcuts to action invocation, guarding editable targets and composing input.
- **[action-registry.ts](./action-registry.ts)** Retains feature action contributions, projects their bindings, and runs actions for the workspace.
- **[action-resolution.ts](./action-resolution.ts)** Resolves action contributions into ids, catalog entries, and default bindings.
- **[keybinding-sync.tsx](./keybinding-sync.tsx)** Synchronizes confirmed keybindings between the action registry and the substrate keybindings channel.
- **[keyboard-event-shortcut.ts](./keyboard-event-shortcut.ts)** Converts a KeyboardEvent into a resolved shortcut chord for action matching.
- **[layout.tsx](./layout.tsx)** Hosts runtime surfaces: fetches the composition, loads surface modules, and mounts them with clients, scoped styles, and error boundaries.
- **[session-actions.tsx](./session-actions.tsx)** Registers the workspace session actions as a feature action contribution.
- **[session-context.tsx](./session-context.tsx)** Provides the workspace session handle and agent activity feed to the workspace tree.
- **[session-controller.ts](./session-controller.ts)** Owns the active-session projection and session mutations for the workspace renderer.
- **[shortcut-platform.ts](./shortcut-platform.ts)** Derives the shortcut platform (macOS or other) from the browser platform.
- **[surface-shared-modules.ts](./surface-shared-modules.ts)** Installs page-shared module instances for runtime surfaces before workspace mount.
- **[workspace.css](./workspace.css)** Base chrome for the shared workspace client.
- **[Workspace.tsx](./Workspace.tsx)** Renders the workspace page: the composed surface row wrapped in action, keybinding, and session providers.

<!-- INDEX:END -->
