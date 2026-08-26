---
summary: "Node-side server composition: boot-loaded workspace registration, public locations, launcher HTTP routes, listener startup, and deterministic host disposal."
---

# Server process

This directory runs only in Node. It snapshots private workspace configuration before listening. It serves public catalog, launcher, and workspace-shell resources without acquiring a workspace guard or booting a runtime. A workspace-page WebSocket lazily acquires one supervised runtime and creates or opens its session attachment. It sends the accepted target, then disposes both attachment and guard on close.

<!-- INDEX:START -->

<!-- Generated from production source-file summaries, local Markdown frontmatter, and child AGENTS.md summaries. Do not edit by hand; run `npm run docs:index`. -->

### Source files

- **[configuration.ts](./configuration.ts)** Declares, validates, normalizes, and documents the server process environment contract.
- **[launcher-routes.ts](./launcher-routes.ts)** Registers the server launcher's HTTP routes.
- **[main.ts](./main.ts)** Starts the loopback server host from environment-backed listener, registry, and public-origin configuration.
- **[mutable-response.ts](./mutable-response.ts)** Applies no-store and browser-hardening headers to mutable HTTP responses.
- **[public-origin.ts](./public-origin.ts)** Normalizes deployment-authored public origins and derives canonical workspace locations from them.
- **[registry.ts](./registry.ts)** Loads the private workspace registry and resolves its manifest-backed entries without booting workspace runtimes.
- **[routes.ts](./routes.ts)** Defines the server host's browser-visible workspace routes and canonical path encoding.
- **[server.ts](./server.ts)** Composes one server host over Fastify routes, workspace supervision, and deterministic disposal.
- **[start.ts](./start.ts)** Starts one configured server host and cleans up failed listener admission.
- **[workspace-routes.ts](./workspace-routes.ts)** Binds workspace page routes and live connections to supervised workspace attachments.
- **[workspace-runtime.ts](./workspace-runtime.ts)** Boots one registered workspace runtime over server-owned dependency adapters.

<!-- INDEX:END -->
