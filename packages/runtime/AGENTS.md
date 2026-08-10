---
summary: "Exactly one workspace's substrate semantics: the accepted feature composition, registries, stores, and agent instances one WorkspaceHandle owns."
read_when: "Writing backend substrate code that belongs to one workspace, or deciding whether a capability is runtime-owned or host-owned."
status: stub
---

# Workspace runtime

Empty until H3 proves concurrent real workspace runtimes in one process. This root then receives the substrate that `src/main/openWorkspace` already performs: feature activation, facet registries, settings, stores, surface delivery, reload coordination, and the agent instance manager. The runtime owns exactly one workspace. Workspace ids, boot coalescing, retention, and process placement stay host policy. It never imports a concrete host or an app composition.

The host provides the runtime's dependencies behind adapters: channel transport, resource delivery, `openExternal`, the Pi profile directory, and the API module directory. Host-stamped attachment context arrives at dispatch outside feature payloads.
