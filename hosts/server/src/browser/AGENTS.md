---
summary: "Server browser entries open workspace pages and connect shared clients to the public catalog and workspace WebSockets."
---

# Server browser entries

These entries run in a standard browser. The launcher reads the public workspace catalog over HTTP and navigates to the selected server-provided workspace URL.

A **workspace page** is one loaded browser page hosting one workspace. It remains open across session navigation and connection replacements. Reloading, closing, or navigating away ends that page instance. Opening its stateful integration does not navigate the browser.

The workspace entry calls `openWorkspacePage()` once and disposes its returned owner on `pagehide`. The internal `pageLifetime` owns the mounted client, roots, history integration, and connection recovery. The separate `acquisition` stack protects initial setup and transfers cleanup ownership to the caller on success. Each physical WebSocket belongs to this longer page lifetime.

The workspace page opens its initial WebSocket from the page URL. The first valid `ready` message accepts the session target and bootstraps its private web binding. For a workspace-only URL, the browser replaces the page URL with the server-provided canonical URL. Accepted in-page session changes add canonical URLs to browser history. Back and forward navigation requests the corresponding session change. If that change fails, the browser restores the previous canonical URL.

The workspace client mounts after the first accepted connection and remains mounted while the browser replaces closed sockets. Each request and response share an id, which lets several requests remain pending at once. The browser delivers channel events to subscribers. When a socket closes, the browser rejects requests sent through that socket and does not replay them.

The browser reconnects to the accepted session after connection loss without remounting the workspace client. After the server accepts a replacement connection, the connection version observable notifies mounted consumers to read authoritative state again. The browser resolves logical resource addresses to workspace-qualified HTTP URLs.

The mounted workspace receives a separate attachment web roots observable. Ordered `web_binding` control messages replace its snapshot before later channel traffic reaches consumers, without advancing the connection version or replacing the socket. A replacement connection publishes its fresh roots before notifying recovery consumers. Messages from old sockets cannot update roots. Retained route clients keep their old, revoked physical addresses.

<!-- INDEX:START -->

<!-- Generated from production source-file summaries, local Markdown frontmatter, and child AGENTS.md summaries. Do not edit by hand; run `npm run docs:index`. -->

### Source files

- **[attachment-web-roots.ts](./attachment-web-roots.ts)** Maintains current feature-root addresses from ordered WebSocket binding updates.
- **[launcher-adapter.ts](./launcher-adapter.ts)** Adapts the public workspace catalog to launcher listing and server-provided workspace navigation.
- **[launcher.html](./launcher.html)** Defines the server launcher document that boots the shared browser client.
- **[main.ts](./main.ts)** Boots the shared launcher client over the server catalog and browser navigation adapter.
- **[workspace-main.ts](./workspace-main.ts)** Opens the workspace page and mounts its shared client after initial connection acceptance.
- **[workspace-page.ts](./workspace-page.ts)** Owns one workspace page across session navigation and WebSocket reconnections.
- **[workspace-websocket-adapter.ts](./workspace-websocket-adapter.ts)** Adapts replaceable accepted browser WebSockets to one host-neutral workspace client.
- **[workspace.html](./workspace.html)** Defines the stateless server workspace document that opens one live attachment.

<!-- INDEX:END -->
