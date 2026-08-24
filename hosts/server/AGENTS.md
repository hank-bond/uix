---
summary: "Server composition root and adapters: HTTP, live transport, process lifecycle, and client bootstraps over the shared supervisor, runtime, and clients."
read_when: "Writing server-host code, or deciding that a capability is server distribution rather than shared substrate."
---

# Server host

The server is a concrete host composition. It owns browser-visible routing, physical transports, listener and process lifecycle, public-origin policy, private workspace registration, and server-specific browser bootstraps. It composes `@uix/host`, `@uix/runtime`, and `@uix/client`. It never imports Electron or an app composition.

The current launcher vertical starts on loopback with zero active workspace runtimes. Build it with `npm run build:server`, then run `npm run start:server`. Run `npm run start:server -- --help` for the declared environment contract. The process reads `server.workspaces.json` from its current directory unless `UIX_SERVER_REGISTRY` names another file. `UIX_SERVER_PORT` defaults to `3000`, and `UIX_PUBLIC_ORIGIN` defaults to the matching loopback origin.

A registry is a boot-loaded snapshot. Relative manifest references resolve from the registry file:

```json
{
  "version": 1,
  "workspaces": [
    { "id": "uix", "manifest": "./uix.workspace.json" }
  ]
}
```

The host reads each catalog name from the manifest. The private registry retains the resolved workspace roots, while `GET /api/catalog` exposes only the version, opaque id, name, and canonical public location. `GET /` serves the shared launcher client. Registry or manifest edits enter the catalog after process restart.

<!-- INDEX:START -->

<!-- Generated from production source-file summaries, local Markdown frontmatter, and child AGENTS.md summaries. Do not edit by hand; run `npm run docs:index`. -->

### Directories

- **[src/](./src/AGENTS.md)** Server-owned process and browser code implementing the HTTP host and mounting shared clients over server adapters.

### Source files

- **[build.config.mjs](./build.config.mjs)** Builds the server process and browser launcher into one runnable output tree.

<!-- INDEX:END -->
