---
summary: "Node-side server composition: boot-loaded workspace registration, public locations, launcher HTTP routes, listener startup, and deterministic host disposal."
---

# Server process

This directory runs only in Node. It snapshots private workspace configuration before listening and serves public catalog and launcher resources without acquiring a workspace guard or booting a runtime.

<!-- INDEX:START -->

<!-- Generated from production source-file summaries, local Markdown frontmatter, and child AGENTS.md summaries. Do not edit by hand; run `npm run docs:index`. -->

### Source files

- **[configuration.ts](./configuration.ts)** Declares, validates, normalizes, and documents the server process environment contract.
- **[main.ts](./main.ts)** Starts the loopback server host from environment-backed listener, registry, and public-origin configuration.
- **[public-origin.ts](./public-origin.ts)** Normalizes deployment-authored public origins and derives canonical workspace locations from them.
- **[registry.ts](./registry.ts)** Loads the private workspace registry and resolves its manifest-backed entries without booting workspace runtimes.
- **[server.ts](./server.ts)** Composes the launcher HTTP service from one boot-loaded registry, public origin, and built browser assets.
- **[start.ts](./start.ts)** Starts one server host from injected environment and process-path inputs while cleaning up failed listener admission.

<!-- INDEX:END -->
