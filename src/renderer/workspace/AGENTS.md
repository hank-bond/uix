---
summary: "The workspace subsystem hosts runtime surfaces and owns session, action, and keybinding state in the renderer."
status: active
---

# Workspace subsystem

The workspace page is one composition. The surface host (`layout.tsx`) fetches the feature surface list and mounts each surface with a channel client, scoped styles, and an error boundary. `Workspace.tsx` renders the host's row and wraps it in the action, keybinding, and session providers.

Actions form one chain. Contributions resolve into ids and catalog entries (`action-resolution.ts`). The registry retains them and projects confirmed bindings (`action-registry.ts`, `action-binding-projection.ts`). Keyboard events convert to chords (`keyboard-event-shortcut.ts`, `shortcut-platform.ts`) and dispatch into the registry (`action-keyboard-dispatcher.tsx`). `keybinding-sync.tsx` reconciles defaults with the substrate settings. `action-context.tsx` provides the registry to the tree.

Sessions flow from the agent channels into `session-controller.ts`, which owns the projection and mutations, exposed through `session-context.tsx`. `session-actions.tsx` registers the session actions into the registry.

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
- **[preload.ts](./preload.ts)** Creates the workspace client over the preload channel transport.
- **[provide-shared-modules.ts](./provide-shared-modules.ts)** Provides page-shared module instances for runtime surfaces.
- **[session-actions.tsx](./session-actions.tsx)** Registers the workspace session actions as a feature action contribution.
- **[session-context.tsx](./session-context.tsx)** Provides the workspace session handle and agent activity feed to the workspace tree.
- **[session-controller.ts](./session-controller.ts)** Owns the active-session projection and session mutations for the workspace renderer.
- **[shortcut-platform.ts](./shortcut-platform.ts)** Derives the shortcut platform (macOS or other) from the browser platform.
- **[Workspace.tsx](./Workspace.tsx)** Renders the workspace page: the composed surface row wrapped in action, keybinding, and session providers.

<!-- INDEX:END -->
