---
summary: "The renderer runs workspace and launcher shell pages over the Electron preload channel transport."
---

# Renderer shell

The renderer contains Electron's two browser-page bootstraps. The launcher and workspace pages adapt `window.channels` into shared `@uix/client` mounts. They never import `ipcRenderer` or own browser presentation.

`main.ts` and `launcher/main.ts` are the page entries. `index.html` and `launcher.html` remain Electron-owned documents because their Content Security Policy and source routes are host concerns. `window.d.ts` declares the preload transport. Client presentation, controllers, styles, and surface hosting live in `packages/client`.

## Contents

<!-- INDEX:START -->

<!-- Generated from production source-file summaries, local Markdown frontmatter, and child AGENTS.md summaries. Do not edit by hand; run `npm run docs:index`. -->

### Directories

- **[launcher/](./launcher/AGENTS.md)** The Electron launcher bootstrap adapts preload IPC into the shared pre-workspace client.

### Source files

- **[electron-workspace-client.ts](./electron-workspace-client.ts)** Adapts the Electron preload transport to the shared workspace client contract.
- **[index.html](./index.html)** The workspace page: boots over the preload transport and renders the composed surface row.
- **[launcher.html](./launcher.html)** The launcher page: opens or creates a workspace before any workspace window exists.
- **[main.ts](./main.ts)** Boots the shared workspace client over the Electron preload adapter.
- **[window.d.ts](./window.d.ts)** The preload channel transport surface exposed on `window.channels`.

<!-- INDEX:END -->
