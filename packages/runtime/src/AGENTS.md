---
summary: "The host-neutral UIX runtime owns one workspace's substrate: feature loading, facet registries, agent driver, stores, settings, and reload over host-supplied transport ports."
---

# Runtime

`runtime.ts` is the composition root. `createWorkspaceRuntime(workspace, ports)` instantiates a workspace's substrate over host-supplied channel and resource transports plus capabilities. Hosts (Electron today, server later) provide the ports. The runtime never imports a host platform.

The runtime owns the facet registries (resources, channels, agent tools, system prompt, skills, turn state, agent context, surfaces). It also owns the agent driver over Pi and the document and manifest stores. Workspace settings, the surface pipeline, and the reload coordinator round it out. Features never import runtime internals. They use the injected context and `@uix/api`.

## Contents

<!-- INDEX:START -->

<!-- Generated from production source-file summaries, local Markdown frontmatter, and child AGENTS.md summaries. Do not edit by hand; run `npm run docs:index`. -->

### Directories

- **[agent/](./agent/AGENTS.md)** The agent runtime opens Pi sessions, handles models and provider sign-in, restores feature state, and keeps the renderer's transcript current.
- **[agent-context/](./agent-context/AGENTS.md)** Agent context assembles feature-provided state into structured messages that Pi sends to the model before a run.
- **[agent-tools/](./agent-tools/AGENTS.md)** Agent tools give each feature safe Pi tool names, reject duplicates, and install the accepted tools for each agent runtime.
- **[features/](./features/AGENTS.md)** The feature runtime loads the workspace's chosen features, isolates failed activations, builds their renderer surfaces, and scaffolds bare editable workspaces.
- **[keybindings/](./keybindings/AGENTS.md)** Main-process keybindings assemble renderer defaults with persisted workspace overrides and publish the resulting bindings.
- **[workspace/](./workspace/AGENTS.md)** Workspace runtime code finds the manifest, keeps workspace and feature settings in sync, and coordinates safe reloads of features and Pi resources.

### Source files

- **[agent-skill-registry.ts](./agent-skill-registry.ts)** Assembles feature-provided Pi skill paths and provides them when Pi discovers runtime resources.
- **[agent-system-prompt-registry.ts](./agent-system-prompt-registry.ts)** Assembles each feature's system-prompt section in workspace order for Pi.
- **[channel-registry.ts](./channel-registry.ts)** Routes feature channel requests and events through the main-process transport with validation at the boundary.
- **[document-store.ts](./document-store.ts)** Persists each document's current content and immutable snapshots under stable namespace and document IDs.
- **[index.ts](./index.ts)** the `@uix/runtime` public facade.
- **[lifecycle.ts](./lifecycle.ts)** Provides disposable helpers that clean up app, window, and component resources with their owners.
- **[log.ts](./log.ts)** Creates main-process loggers that label messages by component and choose readable or JSON output for the environment.
- **[resource-registry.ts](./resource-registry.ts)** Routes resource URLs to the active feature handlers through one validated dispatch boundary.
- **[runtime.ts](./runtime.ts)** The host-neutral workspace runtime composition root.
- **[settings-registry.ts](./settings-registry.ts)** Retains validated settings for each live scope, notifies listeners, and delegates persistence to the workspace layer.
- **[turn-state.ts](./turn-state.ts)** Commits and restores each feature's private branch state in Pi sessions without showing it to the model.

<!-- INDEX:END -->
