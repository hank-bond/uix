---
summary: "The Electron main process starts the app, opens one workspace, connects its features to Pi, and owns their runtime lifetimes."
status: active
---

# Main process

`index.ts` is the application composition root: concrete services do not enroll themselves, and cleanup-producing bindings join explicit application, workspace, window, feature, or agent lifetimes through `lifecycle.ts`.

Workspace adoption precedes feature activation, which acquires live members from the direct facet registries. The agent runtime consumes that selected workspace and feature composition while retaining its separate Pi session lifecycle.

IPC remains a transport boundary rather than a feature contract boundary. Shared author contracts live under `src/api`; the channel and resource registries bind resolved contributions to transports supplied by the main-process composition.

## Contents

<!-- INDEX:START -->

<!-- Generated from production source-file summaries, local Markdown frontmatter, and child AGENTS.md summaries. Do not edit by hand; run `npm run docs:index`. -->

### Directories

- **[agent/](./agent/AGENTS.md)** _(active)._ The agent runtime opens Pi sessions, handles models and provider sign-in, restores feature state, and keeps the renderer's transcript current.
- **[agent-context/](./agent-context/AGENTS.md)** _(active)._ Agent context assembles feature-provided state into structured messages that Pi sends to the model before a run.
- **[agent-tools/](./agent-tools/AGENTS.md)** _(active)._ Agent tools give each feature safe Pi tool names, reject duplicates, and install the accepted tools for each agent runtime.
- **[features/](./features/AGENTS.md)** _(active)._ The feature runtime loads the workspace's chosen features, isolates failed activations, and builds their renderer surfaces. It also creates bare editable workspaces.
- **[keybindings/](./keybindings/AGENTS.md)** _(active)._ Main-process keybindings merge renderer defaults with persisted workspace overrides and publish the resulting bindings.
- **[workspace/](./workspace/AGENTS.md)** _(active)._ Workspace runtime code finds the manifest, keeps workspace and feature settings in sync, and coordinates safe reloads of features and Pi resources.

### Source files

- **[agent-skill-registry.ts](./agent-skill-registry.ts)** Collects feature-provided Pi skill paths and supplies them when Pi discovers runtime resources.
- **[agent-system-prompt-registry.ts](./agent-system-prompt-registry.ts)** Collects each feature's system-prompt section in workspace order and joins them for Pi.
- **[channel-registry.ts](./channel-registry.ts)** Routes feature channel requests and events through the main-process transport with validation at the boundary.
- **[document-store.ts](./document-store.ts)** Stores each document's current content and immutable snapshots under stable namespace and document IDs.
- **[external-links.ts](./external-links.ts)** Keeps renderer navigation contained while delegating approved web URLs to the operating system.
- **[index.ts](./index.ts)** Starts the Electron app, opens a workspace, and owns the lifetimes of its windows, features, and agent sessions.
- **[ipc-wire-log.ts](./ipc-wire-log.ts)** Writes each IPC request or event to the terminal log and, when enabled, a raw file log.
- **[ipc.ts](./ipc.ts)** Carries requests from the renderer to main and sends events back through one logged IPC boundary.
- **[lifecycle.ts](./lifecycle.ts)** Provides disposable helpers that clean up app, window, and component resources with their owners.
- **[log.ts](./log.ts)** Creates main-process loggers that label messages by component and choose readable or JSON output for the environment.
- **[recents.ts](./recents.ts)** Persists a bounded newest-first list of workspace manifests that still exist.
- **[resource-registry.ts](./resource-registry.ts)** Routes resource URLs to the active feature handlers through one validated protocol boundary.
- **[settings-registry.ts](./settings-registry.ts)** Keeps validated settings for each live scope, notifies listeners, and delegates persistence to the workspace layer.
- **[turn-state.ts](./turn-state.ts)** Saves and restores each feature's private branch state in Pi sessions without showing it to the model.

<!-- INDEX:END -->
