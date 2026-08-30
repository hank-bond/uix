---
summary: "Node-side server composition: boot-loaded workspace registration, HTTP routes, attachment-bound WebSocket dispatch, listener startup, and deterministic disposal."
---

# Server process

This directory runs only in Node. It snapshots private workspace configuration before listening. It serves public catalog, launcher, and workspace-shell resources without acquiring a workspace guard or booting a runtime. A workspace-page WebSocket lazily acquires one supervised runtime and creates or opens its session attachment. It sends the accepted target, dispatches correlated canonical requests, and sends only attachment-selected event frames. The WebSocket wire boundary applies contract-owned logging policy. Connection close disposes the attachment and guard without revoking already accepted work.

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
- **[websocket-wire-log.ts](./websocket-wire-log.ts)** Records server WebSocket crossings through one payload-policy boundary.
- **[workspace-routes.ts](./workspace-routes.ts)** Binds workspace page routes and WebSockets to supervised workspace attachments.
- **[workspace-runtime.ts](./workspace-runtime.ts)** Boots one registered workspace runtime over server-owned dependency adapters.
- **[workspace-websocket.ts](./workspace-websocket.ts)** Binds one accepted workspace attachment to its server WebSocket protocol.

<!-- INDEX:END -->
