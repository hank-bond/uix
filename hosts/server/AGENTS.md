---
summary: "Server composition root and adapters: HTTP, live transport, process lifecycle, and client bootstraps over the shared supervisor, runtime, and clients."
read_when: "Writing server-host code, or deciding that a capability is server distribution rather than shared substrate."
---

# Server host

The server is a concrete host composition. It owns browser-visible routing, physical transports, listener and process lifecycle, public-origin policy, private workspace registration, and server-specific browser bootstraps. It composes `@uix/host`, `@uix/runtime`, and `@uix/client`. It never imports Electron or an app composition.

The current host starts on loopback with zero active workspace runtimes. Build it with `npm run build:server`, then run `npm run start:server`. The distribution includes the author API source used to resolve `@uix/api` imports from registered workspaces outside the installation. Run `npm run start:server -- --help` for the declared environment contract. The process reads `server.workspaces.json` from its current directory unless `UIX_SERVER_REGISTRY` names another file. `UIX_SERVER_PORT` defaults to `3000`, `UIX_SERVER_DATA_DIR` defaults to `.uix-server`, and `UIX_PUBLIC_ORIGIN` defaults to the matching loopback origin. The data directory owns the server deployment's Pi profile. Registered workspaces share that profile, which remains separate from their state roots.

A registry is a boot-loaded snapshot. Relative manifest references resolve from the registry file:

```json
{
  "version": 1,
  "workspaces": [
    { "id": "uix", "manifest": "./uix.workspace.json" }
  ]
}
```

The tracked repository manifest is the basic dogfood composition: Chat, workspace tools, and Canvas, without session or local profile state. The host reads each catalog name from the manifest. The private registry retains the resolved workspace roots, while `GET /api/catalog` exposes only the version, opaque id, name, and canonical public location. `GET /` serves the shared launcher client. Registry or manifest edits enter the catalog after process restart.

`GET /workspaces/:workspace` and `GET /workspaces/:workspace/sessions/:session` serve the same stateless workspace shell without booting a runtime. A WebSocket upgrade on the workspace-only location lazily boots its one runtime and durably records a fresh Pi session. Its `ready` frame returns the accepted session id and canonical path. An upgrade on the canonical location attaches to the named session. The browser replaces its location with that server-authored canonical route. Each socket owns its workspace guard and attachment until close. Peers remain independent. Post-handshake request frames are unavailable.

<!-- INDEX:START -->

<!-- Generated from production source-file summaries, local Markdown frontmatter, and child AGENTS.md summaries. Do not edit by hand; run `npm run docs:index`. -->

### Directories

- **[src/](./src/AGENTS.md)** Server-owned process and browser code implementing the HTTP host and mounting shared clients over server adapters.

### Source files

- **[build.config.mjs](./build.config.mjs)** Builds one runnable server distribution from its process, browser, and author-API sources.

<!-- INDEX:END -->
