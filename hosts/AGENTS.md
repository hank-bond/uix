---
summary: "Concrete host composition roots. Each host owns process and platform integration and composes the shared supervisor, runtime, and browser clients behind its own adapters."
read_when: "Deciding whether code is host-owned (process, platform, transport) or belongs in a shared substrate package."
---

# Hosts

Hosts are the concrete composition roots. Each host owns process and platform integration: physical connections, URL routing, origin policy, native capabilities, and the choice between local and proxy workspace handles. Hosts compose the shared supervisor, runtime, and browser clients; they never install app features silently, and they never import each other. Code that both hosts would share belongs in `packages/host` or another substrate package, not in either host root.

<!-- INDEX:START -->

<!-- Generated from each doc's frontmatter by scripts/docs-index.mjs. Do not edit by hand; run `npm run docs:index`. -->

- **[electron/](./electron/AGENTS.md)** _(stub)._ Electron composition root and adapters: native chrome, IPC, protocol, windows, and client bootstraps over the shared supervisor, runtime, and clients. _Writing Electron-specific host code, or deciding that a capability is Electron packaging rather than shared substrate._
- **[server/](./server/AGENTS.md)** _(stub)._ Server composition root and adapters: HTTP, live transport, process lifecycle, and client bootstraps over the shared supervisor, runtime, and clients. _Writing server-host code, or deciding that a capability is server distribution rather than shared substrate._

<!-- INDEX:END -->
