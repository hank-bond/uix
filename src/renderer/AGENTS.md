---
summary: "The renderer runs workspace and launcher shell pages over the Electron preload channel transport."
---

# Renderer shell

The renderer is the host's two Electron pages. The launcher page (`launcher/`) adapts the preload transport into the shared `@uix/client` launcher before any workspace opens. The workspace page still boots the composed surface row directly and moves behind the shared client mount in the next H5 slice. Both pages reach main only through `window.channels`, never directly through `ipcRenderer`.

`main.tsx` and `launcher/main.ts` are the page entries. `index.html` and `launcher.html` remain Electron-owned documents. `styles.css` still owns workspace chrome, while launcher presentation moved with its shared client. `window.d.ts` declares the transport surface. The workspace subsystem under `workspace/` hosts runtime surfaces and owns session, action, and keybinding state.

## Contents

<!-- INDEX:START -->

<!-- Generated from production source-file summaries, local Markdown frontmatter, and child AGENTS.md summaries. Do not edit by hand; run `npm run docs:index`. -->

### Directories

- **[launcher/](./launcher/AGENTS.md)** The Electron launcher bootstrap adapts preload IPC into the shared pre-workspace client.
- **[workspace/](./workspace/AGENTS.md)** The workspace subsystem hosts runtime surfaces and owns session, action, and keybinding state in the renderer.

### Source files

- **[index.html](./index.html)** The workspace page: boots over the preload transport and renders the composed surface row.
- **[launcher.html](./launcher.html)** The launcher page: opens or creates a workspace before any workspace window exists.
- **[main.tsx](./main.tsx)** Boots the workspace window and renders the workspace page over the preload transport.
- **[styles.css](./styles.css)** Base host chrome for the workspace window.
- **[window.d.ts](./window.d.ts)** The preload channel transport surface exposed on `window.channels`.

<!-- INDEX:END -->
