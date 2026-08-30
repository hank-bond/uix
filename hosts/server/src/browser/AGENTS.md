---
summary: "Browser-side server bootstraps for the catalog launcher and the shared workspace client over its WebSocket adapter."
---

# Server browser bootstrap

This directory is bundled for an ordinary browser. It owns the HTTP catalog request and browser navigation effects injected into the host-neutral launcher client. The workspace shell owns its page-matched WebSocket, validates the accepted `ready` frame, and replaces the page location with the canonical session location. It then mounts the shared workspace client over correlated requests and canonical event subscriptions. Connection loss rejects pending browser requests locally. Reconnection remains deferred.

<!-- INDEX:START -->

<!-- Generated from production source-file summaries, local Markdown frontmatter, and child AGENTS.md summaries. Do not edit by hand; run `npm run docs:index`. -->

### Source files

- **[launcher-adapter.ts](./launcher-adapter.ts)** Adapts the public workspace catalog to launcher listing and canonical browser navigation.
- **[launcher.html](./launcher.html)** Defines the server launcher document that boots the shared browser client.
- **[main.ts](./main.ts)** Boots the shared launcher client over the server catalog and browser navigation adapter.
- **[workspace-main.ts](./workspace-main.ts)** Boots the shared workspace client over one server-owned WebSocket.
- **[workspace-websocket-adapter.ts](./workspace-websocket-adapter.ts)** Adapts one accepted browser WebSocket to the host-neutral workspace client.
- **[workspace-websocket.ts](./workspace-websocket.ts)** Opens one workspace page's WebSocket and adapts its accepted session to a workspace client.
- **[workspace.html](./workspace.html)** Defines the stateless server workspace document that opens one live attachment.

<!-- INDEX:END -->
