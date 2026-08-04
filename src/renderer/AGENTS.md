---
summary: "The renderer runs two shell pages, the workspace window and the start picker, over the preload channel transport."
status: active
---

# Renderer shell

The renderer is the host's two Electron pages. The start picker page (`picker/`) runs before any workspace opens and selects or creates one. The workspace page boots the composed surface row over the preload transport. Both pages reach main only through the preload channel transport (`window.channels`), never directly through `ipcRenderer`.

`main.tsx` and `picker/main.tsx` are the page entries. `index.html` and `picker.html` are their documents, and `styles.css` and `picker/picker.css` their chrome. `window.d.ts` declares the transport surface. The workspace subsystem under `workspace/` hosts the runtime surfaces and owns session, action, and keybinding state.

## Contents

<!-- INDEX:START -->

<!-- Generated from production source-file summaries, local Markdown frontmatter, and child AGENTS.md summaries. Do not edit by hand; run `npm run docs:index`. -->

### Directories

- **[picker/](./picker/AGENTS.md)** _(active)._ The start picker page lists recent workspaces and creates new ones before any workspace window opens.
- **[workspace/](./workspace/AGENTS.md)** _(active)._ The workspace subsystem hosts runtime surfaces and owns session, action, and keybinding state in the renderer.

### Source files

- **[index.html](./index.html)** The workspace page: boots over the preload transport and renders the composed surface row.
- **[main.tsx](./main.tsx)** Boots the workspace window and renders the workspace page over the preload transport.
- **[picker.html](./picker.html)** The start picker page: opens or creates a workspace before any workspace window exists.
- **[styles.css](./styles.css)** Base host chrome for the workspace window.
- **[window.d.ts](./window.d.ts)** The preload channel transport surface exposed on `window.channels`.

<!-- INDEX:END -->
