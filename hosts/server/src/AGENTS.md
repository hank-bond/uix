---
summary: "Server-owned process and browser code implementing HTTP and WebSocket transport while mounting shared clients over server adapters."
---

# Server source

The process side owns configuration, private workspace resolution, public locations, HTTP content routes, WebSocket messaging, and listener lifetime. The browser side mounts the shared launcher and workspace clients over server adapters, including logical-resource URL projection. Neither side changes workspace or feature contracts.

<!-- INDEX:START -->

<!-- Generated from production source-file summaries, local Markdown frontmatter, and child AGENTS.md summaries. Do not edit by hand; run `npm run docs:index`. -->

### Directories

- **[browser/](./browser/AGENTS.md)** Server browser entries open workspace pages and connect shared clients to the public catalog and workspace WebSockets.
- **[node/](./node/AGENTS.md)** Node-side server composition: boot-loaded workspace registration, HTTP routes, attachment-bound WebSocket dispatch, listener startup, and deterministic disposal.

### Source files

- **[resource-urls.ts](./resource-urls.ts)** Maps host-neutral logical resource addresses to the server's HTTP content plane.
- **[viewpoint-urls.ts](./viewpoint-urls.ts)** Encodes and decodes the server's attachment-bound feature directory URLs.
- **[websocket-messages.ts](./websocket-messages.ts)** Defines and validates the server WebSocket transport's application messages.

<!-- INDEX:END -->
