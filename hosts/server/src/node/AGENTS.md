---
summary: "Node-side server composition: boot-loaded workspace registration, HTTP routes, attachment-bound WebSocket dispatch, listener startup, and deterministic disposal."
---

# Server process

This directory runs only in Node. It snapshots private workspace configuration before listening. It serves the public catalog, launcher, and workspace shell without acquiring a workspace guard or booting a runtime. Process signals stop admission and notify and close live connections. The process then awaits listener and workspace teardown. Shutdown during startup disposes any host that later reaches listener admission. A workspace-page WebSocket lazily acquires one supervised runtime and creates or opens its session attachment. It sends the accepted target, dispatches correlated canonical requests, and sends only attachment-selected event messages. The WebSocket wire boundary applies contract-owned logging policy. Connection close disposes the attachment and guard without revoking already accepted work.

Accepted WebSockets use periodic ping/pong and terminate after a missed heartbeat so dead browser connections release their attachment and guard. A workspace content request independently acquires a workspace guard. It decodes a logical resource URL or an attachment-bound viewpoint URL and dispatches through that runtime's registered content handler. The request retains the guard until the HTTP response completes and never creates an attachment. The HTTP boundary owns physical URL encoding, cache defaults, hardening headers, and configured-origin CORS policy. Viewpoint requests present the opaque binding, feature namespace, local path, query, and method to runtime dispatch without selecting an Agent in the host. Complete-page locations must retain the bound feature directory for native relative addressing.

Each accepted WebSocket sends its initial binding in `ready` and owns a binding-change subscription until close. Retarget sends an ordered `web_binding` control message independently of feature channels. The binding's lifetime remains runtime-owned, so closing or retargeting a socket rejects later use of its old URLs without cancelling accepted HTTP work.

<!-- INDEX:START -->

<!-- Generated from production source-file summaries, local Markdown frontmatter, and child AGENTS.md summaries. Do not edit by hand; run `npm run docs:index`. -->

### Source files

- **[configuration.ts](./configuration.ts)** Defines the server deployment configuration and its environment contract.
- **[external-links.ts](./external-links.ts)** Launches approved web links on the loopback server's local machine without exposing a shell.
- **[launcher-routes.ts](./launcher-routes.ts)** Registers the server launcher's HTTP routes.
- **[main.ts](./main.ts)** Starts the selected server profile and drains it on SIGINT or SIGTERM.
- **[mutable-response.ts](./mutable-response.ts)** Applies no-store and browser-hardening headers to mutable HTTP responses.
- **[process-lifetime.ts](./process-lifetime.ts)** Coordinates signal-triggered shutdown with a host that may still be starting.
- **[public-origin.ts](./public-origin.ts)** Defines the server public-origin policy for requests and canonical locations.
- **[registry.ts](./registry.ts)** Loads the private workspace registry and resolves its manifest-backed entries without booting workspace runtimes.
- **[routes.ts](./routes.ts)** Defines the server host's browser-visible workspace routes and canonical path encoding.
- **[server.ts](./server.ts)** Composes one public-origin-gated server with graceful live-connection and workspace teardown.
- **[start.ts](./start.ts)** Starts one configured server host and cleans up failed listener admission.
- **[websocket-wire-log.ts](./websocket-wire-log.ts)** Records server WebSocket crossings through one payload-policy boundary.
- **[workspace-content-routes.ts](./workspace-content-routes.ts)** Serves workspace resources and viewpoint routes over HTTP with request-owned runtime authority.
- **[workspace-content-transport.ts](./workspace-content-transport.ts)** Binds each supervised runtime's content dispatcher to server HTTP requests.
- **[workspace-routes.ts](./workspace-routes.ts)** Binds workspace page routes and WebSockets to supervised workspace attachments.
- **[workspace-runtime.ts](./workspace-runtime.ts)** Boots one registered workspace runtime over server-owned dependency adapters.
- **[workspace-websocket.ts](./workspace-websocket.ts)** Enforces the workspace WebSocket protocol across attachment acceptance, request dispatch, event delivery, and heartbeat liveness.

<!-- INDEX:END -->
