---
summary: "The renderer runs workspace and launcher shell pages over the Electron preload channel transport."
---

# Renderer shell

The renderer contains Electron's launcher and workspace page entries. These entries adapt the `window.channels` capability for the shared clients in the `@uix/client` package. Neither entry imports the `ipcRenderer` object or owns browser presentation.

The workspace entry waits for initial feature roots before starting the shared client. The roots observable subscribes to binding changes before requesting the initial snapshot and rejects older revisions. This ordering prevents a delayed response from replacing a later target update. The page owns the observable from creation, so page disposal stops observation even during the initial read.

`main.ts` and `launcher/main.ts` are the page entries. `index.html` and `launcher.html` remain Electron-owned documents because their Content Security Policy and source routes are host concerns. `window.d.ts` declares the preload transport. Client presentation, state owners, styles, and surface hosting live in `packages/client`.

## Contents

<!-- INDEX:START -->

<!-- Generated from production source-file summaries, local Markdown frontmatter, and child AGENTS.md summaries. Do not edit by hand; run `npm run docs:index`. -->

### Directories

- **[launcher/](./launcher/AGENTS.md)** The Electron launcher bootstrap adapts preload IPC into the shared pre-workspace client.

### Source files

- **[attachment-web-roots.ts](./attachment-web-roots.ts)** Maintains current feature-root addresses from attachment binding updates.
- **[electron-action-invocation-source.ts](./electron-action-invocation-source.ts)** Adapts Electron menu selections into validated renderer action invocations.
- **[electron-workspace-client.ts](./electron-workspace-client.ts)** Adapts the Electron preload transport to the shared workspace client contract.
- **[index.html](./index.html)** The workspace page: boots over the preload transport and renders the composed surface row.
- **[launcher.html](./launcher.html)** The launcher page: opens or creates a workspace before any workspace window exists.
- **[main.ts](./main.ts)** Starts the shared workspace client with Electron's communication adapters.
- **[window.d.ts](./window.d.ts)** Host communication capabilities provided by preload to main-frame pages.

<!-- INDEX:END -->
