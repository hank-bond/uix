---
summary: "Electron-owned process and browser code implementing native lifecycle, IPC and resource transport, preload isolation, and shared-client bootstraps."
---

# Electron source

The main process owns windows, menus, dialogs, recents, IPC, the resource protocol, and process lifecycle. Each workspace window binds its `webContents` identity to one supervised workspace guard and attachment. `preload.ts` exposes only `channel-transport.ts`, and the renderer entries adapt that transport into shared launcher and workspace clients.

<!-- INDEX:START -->

<!-- Generated from production source-file summaries, local Markdown frontmatter, and child AGENTS.md summaries. Do not edit by hand; run `npm run docs:index`. -->

### Directories

- **[main/](./main/AGENTS.md)** The Electron main process composes supervised workspace runtimes over native windows, IPC, the resource protocol, launcher operations, and awaited process teardown.
- **[renderer/](./renderer/AGENTS.md)** The renderer runs workspace and launcher shell pages over the Electron preload channel transport.

### Source files

- **[channel-transport.ts](./channel-transport.ts)** Defines the Electron host channel transport shared by main, preload, and renderer code.
- **[preload.ts](./preload.ts)** Exposes the typed channel transport on `window.channels` for sandboxed renderer pages.

<!-- INDEX:END -->
