---
summary: "Electron composition root and adapters: native chrome, IPC, protocol, windows, and client bootstraps over the shared supervisor, runtime, and clients."
read_when: "Writing Electron-specific host code, or deciding that a capability is Electron packaging rather than shared substrate."
---

# Electron host

The Electron host owns native lifecycle and chrome, physical IPC, the privileged resource protocol, preload isolation, and browser-page bootstraps. It composes `@uix/host`, `@uix/runtime`, and `@uix/client` without depending on the server host or app features.

Each workspace window is one physical connection identified by its `webContents` property. The window owns a workspace guard and attachment for its complete lifetime. Canonical requests resolve through that attachment, and scoped attachment events return to the same window.

The content transport uses the workspace token in each physical origin to select a handler registered by the workspace runtime. Viewpoint addresses have distinct feature origins and include the attachment binding in the directory path. Preload validates binding snapshots before providing them to the renderer. The renderer uses these snapshots to derive feature roots during initial workspace setup and after each target replacement.

Build or run this host through the root `build`, `dev`, and `start` scripts. Its electron-vite configuration keeps the existing `out/main`, `out/preload`, and `out/renderer` distribution layout while sourcing every Electron-owned entry from this root.

## Behavior tests

Run `npx vitest run hosts/electron/src/viewpoint-web.test.ts` for the Playwright Electron test. The test builds the host, launches it with a temporary workspace and user-data directory, and exercises production Canvas and Chat alongside a test-only route surface. It requires a graphical session or a virtual display such as Xvfb on Linux. Electron provides Chromium, so this test does not require a separate Playwright browser download.

The test also runs through `npm test` and `npm run check`. It passes the host's `--hidden` switch to create shell windows without displaying them. Hidden windows still render and support screenshots. To display the test window for debugging, run:

```bash
UIX_ELECTRON_TEST_SHOW_WINDOW=1 npx vitest run hosts/electron/src/viewpoint-web.test.ts
```

Screenshots go to `out/test-results/` for inspection. Layout and style assertions run in Chromium, but the screenshots are not a pixel-diff baseline.

<!-- INDEX:START -->

<!-- Generated from production source-file summaries, local Markdown frontmatter, and child AGENTS.md summaries. Do not edit by hand; run `npm run docs:index`. -->

### Directories

- **[src/](./src/AGENTS.md)** Electron-owned process and browser code implementing native lifecycle, IPC and resource transport, preload isolation, and shared-client bootstraps.

### Source files

- **[electron.vite.config.ts](./electron.vite.config.ts)** Builds the Electron main, preload, and renderer entries from their discrete host root.

<!-- INDEX:END -->
