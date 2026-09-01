---
summary: "Electron-owned process and browser code implementing native lifecycle, IPC and resource transport, preload isolation, and shared-client bootstraps."
---

# Electron source

The main process owns windows, menus, dialogs, recents, IPC, the resource protocol, and process lifecycle. Its workspace window owns one direct runtime attachment. `preload.ts` exposes only `channel-transport.ts`, and the renderer entries adapt that transport into shared launcher and workspace clients.

<!-- INDEX:START -->

<!-- Generated from production source-file summaries, local Markdown frontmatter, and child AGENTS.md summaries. Do not edit by hand; run `npm run docs:index`. -->

### Directories

- **[main/](./main/AGENTS.md)** The Electron host composition opens one workspace runtime over Electron transports and owns windows, menu, launcher, recents, and the transports.
- **[renderer/](./renderer/AGENTS.md)** The renderer runs workspace and launcher shell pages over the Electron preload channel transport.

### Source files

- **[channel-transport.ts](./channel-transport.ts)** Defines the Electron host channel transport shared by main, preload, and renderer code.
- **[preload.ts](./preload.ts)** Exposes the typed channel transport on `window.channels` for sandboxed renderer pages.

<!-- INDEX:END -->
