---
summary: "The Electron launcher bootstrap adapts preload IPC into the shared pre-workspace client."
---

# Electron launcher bootstrap

This directory contains only Electron-side composition. It maps launcher IPC into the host-neutral `LauncherAdapter`, mounts the shared `@uix/client` launcher, and disposes that page mount on `pagehide`. Launcher presentation and styles belong to the client package.

## Contents

<!-- INDEX:START -->

<!-- Generated from production source-file summaries, local Markdown frontmatter, and child AGENTS.md summaries. Do not edit by hand; run `npm run docs:index`. -->

### Source files

- **[electron-launcher-adapter.ts](./electron-launcher-adapter.ts)** Adapts Electron launcher IPC to the shared launcher's host capabilities.
- **[main.ts](./main.ts)** Boots the shared launcher client over the Electron preload adapter.

<!-- INDEX:END -->
