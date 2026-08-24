---
summary: "Reusable substrate packages. api holds the feature-author contracts. runtime owns the one-workspace substrate. host holds the shared supervision contracts. client is an empty ownership root awaiting the shared browser client."
read_when: "Deciding whether code belongs in a reusable package, a concrete host, or an app composition."
---

# Substrate packages

Packages hold reusable, host-neutral substrate code. The dependency direction is one-way. Runtime and client depend only on the author contracts in `@uix/api`. Hosts compose them, and nothing here imports a concrete host or an app composition. `api`, `runtime`, and `host` are live: `host` holds the shared supervisor and workspace/attachment handles proved by the in-memory suite. `client` remains an empty ownership root until the shared browser client is extracted. Do not treat its absence as license to route around the graph.

<!-- INDEX:START -->

<!-- Generated from production source-file summaries, local Markdown frontmatter, and child AGENTS.md summaries. Do not edit by hand; run `npm run docs:index`. -->

### Directories

- **[api/](./api/AGENTS.md)** The `@uix/api` feature-author contracts: the one boundary features import and the substrate implements. _Adding or changing a contract that features import, or deciding whether a shape belongs in the author API at all._
- **[client/](./client/AGENTS.md)** Launcher and workspace browser clients: host-neutral UI entries that receive constructed adapters and never detect concrete hosts. _Writing shared browser client code, or deciding whether a client capability is host-owned._
- **[host/](./host/AGENTS.md)** Shared host contracts and coordination: the workspace supervisor, workspace and attachment handles, and the launcher/catalog projection schemas that concrete hosts compose. _Writing host-neutral supervision or launcher code that both Electron and server hosts share._
- **[runtime/](./runtime/AGENTS.md)** Exactly one workspace's substrate semantics: the accepted feature composition, registries, stores, surface delivery, reload coordination, and agent instances one WorkspaceRuntime owns. _Writing backend substrate code that belongs to one workspace, or deciding whether a capability is runtime-owned or host-owned._

<!-- INDEX:END -->
