---
summary: "Reusable substrate packages. api holds the feature-author contracts. runtime owns the one-workspace substrate. client and host are empty ownership roots that later plan units fill behind one-way dependency rules."
read_when: "Deciding whether code belongs in a reusable package, a concrete host, or an app composition."
---

# Substrate packages

Packages hold reusable, host-neutral substrate code. The dependency direction is one-way. Runtime and client depend only on the author contracts in `@uix/api`. Hosts compose them, and nothing here imports a concrete host or an app composition. `api` and `runtime` are live. `client` and `host` are empty ownership roots that earn source in later plan units. Do not treat their absence as license to route around the graph.

<!-- INDEX:START -->

<!-- Generated from production source-file summaries, local Markdown frontmatter, and child AGENTS.md summaries. Do not edit by hand; run `npm run docs:index`. -->

### Directories

- **[api/](./api/AGENTS.md)** The `@uix/api` feature-author contracts: the one boundary features import and the substrate implements. _Adding or changing a contract that features import, or deciding whether a shape belongs in the author API at all._
- **[client/](./client/AGENTS.md)** _(stub)._ Launcher and workspace browser clients: host-neutral UI entries that receive constructed adapters and never detect concrete hosts. _Writing shared browser client code, or deciding whether a client capability is host-owned._
- **[host/](./host/AGENTS.md)** _(stub)._ Shared host contracts and coordination: the workspace supervisor, workspace handles, and launcher/catalog projection schemas that concrete hosts compose. _Writing host-neutral supervision or launcher code that both Electron and server hosts share._
- **[runtime/](./runtime/AGENTS.md)** Exactly one workspace's substrate semantics: the accepted feature composition, registries, stores, surface delivery, reload coordination, and agent instances one WorkspaceRuntime owns. _Writing backend substrate code that belongs to one workspace, or deciding whether a capability is runtime-owned or host-owned._

<!-- INDEX:END -->
