---
summary: "Server composition root and adapters: HTTP, WebSocket transport, process lifecycle, and client bootstraps over the shared supervisor, runtime, and clients."
read_when: "Writing server-host code, or deciding that a capability is server distribution rather than shared substrate."
---

# Server host

The server is a concrete host composition. It owns browser-visible routing, physical transports, listener and process lifecycle, public-origin policy, private workspace registration, and server-specific browser bootstraps. It composes `@uix/host`, `@uix/runtime`, and `@uix/client`. It never imports Electron or an app composition.

The server starts on loopback with zero active workspace runtimes. Build it with `npm run build:server`, then run `npm run start:server`. The distribution includes the author API source used to resolve `@uix/api` imports from registered workspaces outside the installation. Run `npm run start:server -- --help` for the declared environment contract. The process reads `server.workspaces.json` from its current directory unless `UIX_SERVER_REGISTRY` names another file. `UIX_SERVER_HOST` defaults to `127.0.0.1`, `UIX_SERVER_PORT` defaults to `3000`, and `UIX_SERVER_DATA_DIR` defaults to `.uix-server`. The data directory owns the server deployment's Pi profile. Registered workspaces share that profile, which remains separate from their state roots.

`UIX_SERVER_PROFILE` selects one explicit deployment policy:

- `loopback` is the default. It requires a loopback listener and public origin. When `UIX_PUBLIC_ORIGIN` is absent, the host derives the matching HTTP origin from its listener configuration. Provider-auth links may launch in the server machine's default browser.
- `trusted-network` uses plaintext HTTP only on a deployment-provided encrypted trusted network. It requires an explicit `UIX_PUBLIC_ORIGIN` and explicit `UIX_SERVER_HOST` for non-loopback binding.
- `tls` requires an explicit browser-visible HTTPS origin. TLS may terminate at trusted ingress. The ingress-to-host connection must remain inside the deployment's trusted boundary.

Every request authority must match `UIX_PUBLIC_ORIGIN`. A supplied browser `Origin` must match it too. The host ignores forwarding headers, so trusted ingress must preserve the public `Host` authority rather than asking UIX to infer it.

Nonlocal profiles never launch provider-auth links on the server machine. Chat retains those links for explicit opening on the browser device.

A registry is a boot-loaded snapshot. Relative manifest references resolve from the registry file:

```json
{
  "version": 1,
  "workspaces": [
    { "id": "uix", "manifest": "./uix.workspace.json" }
  ]
}
```

The tracked repository manifest is the basic dogfood composition: Chat, workspace tools, and Canvas, without session or local profile state. The host reads each catalog name from the manifest. Workspace ids use lowercase transport tokens because they occupy both URL path segments and logical resource hosts. The private registry retains the resolved workspace roots, while `GET /api/catalog` exposes only the version, opaque id, name, and canonical public location. `GET /` serves the shared launcher client. Registry or manifest edits enter the catalog after process restart.

`GET /workspaces/:workspace` and `GET /workspaces/:workspace/sessions/:session` serve the same stateless workspace shell without booting a runtime. A WebSocket upgrade on the workspace-only location lazily boots its one runtime and durably records a fresh Pi session. Its `ready` message returns the accepted session id and canonical path. An upgrade on the canonical location attaches to the named session. The browser replaces its location with that server-authored canonical route and mounts the shared workspace client.

The server detects dead live connections with periodic ping/pong. The browser reconnects to the canonical session with capped backoff, never replays pending requests, and rehydrates mounted snapshot consumers after each accepted replacement connection. SIGTERM and SIGINT stop admission, notify live connections, close their ownership, and await listener and workspace teardown. Post-handshake request messages include only correlation id, canonical channel, and payload. The server asks the socket's attachment to prepare every request. It applies contract-owned log policy at the WebSocket wire boundary and sends one terminal response or error. A duplicate in-flight correlation receives a nonterminal protocol error without disturbing the accepted request. Attachment-selected event messages include only event id, canonical channel, and payload. Each socket owns its workspace guard and attachment until close, while accepted dispatches retain independent runtime authority through completion.

Logical `uix-resource://` references remain host-neutral in channel payloads. The browser adapter maps them to workspace-qualified HTTP URLs. Every content request acquires its own workspace guard and dispatches through the runtime's registered resource boundary without creating an attachment. Versioned surface modules, CSS, and assets retain exact bytes for the runtime lifetime and use immutable caching. Mutable feature resources default to `no-store`. The HTTP boundary removes runtime-authored cross-origin grants and derives any grant from the configured public origin.

<!-- INDEX:START -->

<!-- Generated from production source-file summaries, local Markdown frontmatter, and child AGENTS.md summaries. Do not edit by hand; run `npm run docs:index`. -->

### Directories

- **[src/](./src/AGENTS.md)** Server-owned process and browser code implementing HTTP and WebSocket transport while mounting shared clients over server adapters.

### Source files

- **[build.config.mjs](./build.config.mjs)** Builds one runnable server distribution from its process, browser, and author-API sources.

<!-- INDEX:END -->
