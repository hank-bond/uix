---
summary: "Server browser entries connect the public workspace catalog and one workspace WebSocket to the shared launcher and workspace clients."
---

# Server browser entries

These entries run in a standard browser. The launcher reads the public workspace catalog over HTTP and navigates to the selected server-provided workspace URL.

The workspace entry opens one WebSocket from the page URL. The first valid `ready` message accepts the session target. For a workspace-only URL, the browser replaces the page URL with the server-provided canonical URL. Accepted in-page session changes add canonical URLs to browser history. Back and forward navigation requests the corresponding session change. If that change fails, the browser restores the previous canonical URL.

The workspace client mounts after the first accepted connection and remains mounted while the browser replaces closed sockets. Each request and response share an id, which lets several requests remain pending at once. The browser delivers channel events to subscribers. When a socket closes, the browser rejects requests sent through that socket and does not replay them.

The browser reconnects to the accepted session after connection loss without remounting the workspace client. After the server accepts a replacement connection, the connection version observable notifies mounted consumers to read authoritative state again. The browser resolves logical resource addresses to workspace-qualified HTTP URLs.

<!-- INDEX:START -->

<!-- Generated from production source-file summaries, local Markdown frontmatter, and child AGENTS.md summaries. Do not edit by hand; run `npm run docs:index`. -->

### Source files

- **[launcher-adapter.ts](./launcher-adapter.ts)** Adapts the public workspace catalog to launcher listing and server-provided workspace navigation.
- **[launcher.html](./launcher.html)** Defines the server launcher document that boots the shared browser client.
- **[main.ts](./main.ts)** Boots the shared launcher client over the server catalog and browser navigation adapter.
- **[workspace-main.ts](./workspace-main.ts)** Boots the shared workspace client over one server-owned WebSocket.
- **[workspace-websocket-adapter.ts](./workspace-websocket-adapter.ts)** Adapts replaceable accepted browser WebSockets to one host-neutral workspace client.
- **[workspace-websocket.ts](./workspace-websocket.ts)** Owns one reconnecting workspace connection, shutdown notices, and its stable client.
- **[workspace.html](./workspace.html)** Defines the stateless server workspace document that opens one live attachment.

<!-- INDEX:END -->
