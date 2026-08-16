---
summary: "The `@uix/runtime` source map: the exactly-one-workspace contract surface (ids, canonical dispatch envelope, scoped events, the runtime interface) plus the real substrate composition behind it."
read_when: "Implementing the workspace runtime, or changing the boundary the host composes."
---

# Workspace runtime source map

This package owns the runtime-facing contract and its implementation. An in-memory proof defined the smallest executable shape. The real substrate then moved out of `src/main` behind it. The runtime constructor (`runtime.ts`) composes documents, manifest store, workspace settings, facet registries, one workspace agent runtime, unified attachments, the surface pipeline, and the reload coordinator. The host imports this package and provides the runtime's dependencies as adapters. The generic `Guard<Value>` capability gives workspace and agent-instance supervisors one guard contract without exposing owner disposal. Nothing here imports a concrete host, and the envelope carries no transport or tenancy fields.

## Contents

<!-- INDEX:START -->

<!-- Generated from production source-file summaries, local Markdown frontmatter, and child AGENTS.md summaries. Do not edit by hand; run `npm run docs:index`. -->

### Directories

- **[agent/](./agent/AGENTS.md)** The agent runtime opens Pi sessions, handles models and provider sign-in, restores feature state, and keeps the renderer's transcript current.
- **[agent-context/](./agent-context/AGENTS.md)** Agent context assembles feature-provided state into structured messages that Pi sends to the model before a run.
- **[agent-tools/](./agent-tools/AGENTS.md)** Agent tools give each feature safe Pi tool names, reject duplicates, and install the accepted tools for each agent runtime.
- **[keybindings/](./keybindings/AGENTS.md)** Runtime keybindings assemble renderer defaults with persisted workspace overrides and publish the resulting bindings.

### Source files

- **[agent-skill-registry.ts](./agent-skill-registry.ts)** Assembles feature-provided Pi skill paths and provides them when Pi discovers runtime resources.
- **[agent-system-prompt-registry.ts](./agent-system-prompt-registry.ts)** Assembles each feature's system-prompt section in workspace order for Pi.
- **[channel-registry.ts](./channel-registry.ts)** Owns one workspace's canonical channel table, prepared dispatches, and typed event publication.
- **[dispatch.ts](./dispatch.ts)** Canonical request preparation and the attachment-stamped dispatch context.
- **[document-store.ts](./document-store.ts)** Persists each document's current content and immutable snapshots under stable namespace and document IDs.
- **[events.ts](./events.ts)** Explicitly scoped canonical runtime events for host-selected delivery.
- **[guard.ts](./guard.ts)** Generic guard capabilities that pair supervisor-owned lifetime authority with operational values.
- **[index.ts](./index.ts)** The @uix/runtime public facade re-exporting the workspace-runtime contract and its factory.
- **[lifecycle.ts](./lifecycle.ts)** Provides synchronous and asynchronous lifetime bags plus disposable helpers.
- **[log.ts](./log.ts)** Creates main-process loggers that label messages by component and choose readable or JSON output for the environment.
- **[manifest-store.ts](./manifest-store.ts)** Reads workspace manifests into staged copies and atomically writes the accepted copy back to disk.
- **[reload.ts](./reload.ts)** Runs one workspace reload at a time across feature activation, Pi resources, restored state, and renderer notification.
- **[resource-registry.ts](./resource-registry.ts)** Routes resource URLs to the active feature handlers through one validated boundary.
- **[roots.ts](./roots.ts)** Finds stable paths for workspace state, the agent working directory, and the manifest from one startup target.
- **[runtime.ts](./runtime.ts)** Composes the workspace substrate into one exactly-one-workspace runtime over host-provided dependencies.
- **[settings-namespace.ts](./settings-namespace.ts)** Defines a named, schema-checked group of workspace settings.
- **[settings-registry.ts](./settings-registry.ts)** Retains validated settings for each live scope, notifies listeners, and delegates persistence to the workspace layer.
- **[turn-state.ts](./turn-state.ts)** Commits and restores each feature's private branch state in Pi sessions without showing it to the model.
- **[workspace-settings.ts](./workspace-settings.ts)** Validates a staged manifest's settings, makes them live together, and connects them to their persisted locations.
- **[workspace.ts](./workspace.ts)** The workspace-runtime contract: ids, session targets, and the exactly-one-workspace runtime surface a host composes.

<!-- INDEX:END -->
