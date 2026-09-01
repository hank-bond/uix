---
summary: "Electron composition root and adapters: native chrome, IPC, protocol, windows, and client bootstraps over the shared supervisor, runtime, and clients."
read_when: "Writing Electron-specific host code, or deciding that a capability is Electron packaging rather than shared substrate."
---

# Electron host

The Electron host owns native lifecycle and chrome, physical IPC, the privileged resource protocol, preload isolation, and browser-page bootstraps. It composes `@uix/host`, `@uix/runtime`, and `@uix/client` without depending on the server host or app features.

Each workspace window is one physical connection identified by its `webContents`. It owns one `WorkspaceGuard` and attachment for its complete lifetime. Canonical requests resolve through that connection binding, while scoped attachment events return over the same window. A host-wide resource transport selects runtime handlers by the workspace token in each logical resource origin.

Build or run this host through the root `build`, `dev`, and `start` scripts. Its electron-vite configuration keeps the existing `out/main`, `out/preload`, and `out/renderer` distribution layout while sourcing every Electron-owned entry from this root.

<!-- INDEX:START -->

<!-- Generated from production source-file summaries, local Markdown frontmatter, and child AGENTS.md summaries. Do not edit by hand; run `npm run docs:index`. -->

### Directories

- **[src/](./src/AGENTS.md)** Electron-owned process and browser code implementing native lifecycle, IPC and resource transport, preload isolation, and shared-client bootstraps.

### Source files

- **[electron.vite.config.ts](./electron.vite.config.ts)** Builds the Electron main, preload, and renderer entries from their discrete host root.

<!-- INDEX:END -->
