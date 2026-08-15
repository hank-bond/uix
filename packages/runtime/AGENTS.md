---
summary: "Exactly one workspace's substrate semantics: the accepted feature composition, registries, stores, surface delivery, reload coordination, and agent instances one WorkspaceRuntime owns."
read_when: "Writing backend substrate code that belongs to one workspace, or deciding whether a capability is runtime-owned or host-owned."
---

# Workspace runtime

This package holds the substrate that `src/main/openWorkspace` used to perform. An isolation suite proves concurrent real workspace runtimes in one process. It covers feature activation, facet registries, settings, stores, surface delivery, reload coordination, unified attachments, and session-keyed agent instances. The runtime owns exactly one workspace. Workspace ids, single-flight boot, workspace guards, and process placement stay host policy. It never imports a concrete host or an app composition.

The host provides the runtime's dependencies behind adapters: resource delivery, `openExternal`, the Pi app data directory, and the API module directory. Canonical requests enter through runtime-created attachments, which prepare dispatch with trusted context outside feature payloads. The runtime constructor (`runtime.ts`) wires the whole substrate behind the `WorkspaceRuntime` contract, and `channel-registry.ts` holds its one canonical handler table. See [`src/AGENTS.md`](./src/AGENTS.md) for the per-file source map.
