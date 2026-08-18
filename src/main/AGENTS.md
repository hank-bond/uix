---
summary: "The Electron host composition opens one workspace runtime over Electron transports and owns windows, menu, launcher, recents, and the transports."
---

# Main process (Electron host)

`index.ts` is the host composition root. It constructs exactly one workspace runtime from `@uix/runtime` with the `uix-resource` protocol adapter and `shell.openExternal` dependency. It owns the shell chrome around that runtime: windows, the workspace menu, the launcher, recents, and Electron IPC. Canonical requests enter through the window's attachment, while scoped runtime events leave through its event subscription. The workspace substrate itself lives in `@uix/runtime`.

Cleanup-producing bindings join explicit application, window, or launcher lifetimes through `lifecycle.ts` (the host-neutral helpers re-exported from `@uix/runtime/lifecycle`). Synchronous host bindings enter `DisposableBag`. Workspace runtimes enter `AsyncDisposableBag`. The host prevents the first `before-quit`, drains both, and resumes Electron shutdown only after asynchronous workspace teardown settles. `ipc.ts` records every physical crossing. This one-window composition creates its fallback attachment directly from the runtime and does not use the shared `WorkspaceSupervisor`.

## Contents

<!-- INDEX:START -->

<!-- Generated from production source-file summaries, local Markdown frontmatter, and child AGENTS.md summaries. Do not edit by hand; run `npm run docs:index`. -->

### Source files

- **[external-links.ts](./external-links.ts)** Contains renderer navigation while delegating approved web URLs to the operating system.
- **[index.ts](./index.ts)** Starts the Electron host, opens a workspace, and owns the lifetimes of its windows and host chrome.
- **[ipc-wire-log.ts](./ipc-wire-log.ts)** Writes each IPC request or event to the terminal log and, when enabled, a raw file log.
- **[ipc.ts](./ipc.ts)** Relays requests from the renderer to main and sends events back through one logged IPC boundary.
- **[lifecycle.ts](./lifecycle.ts)** Electron-side lifetime helpers.
- **[recents.ts](./recents.ts)** Persists a bounded newest-first list of workspace manifests that still exist.
- **[resource-transport.ts](./resource-transport.ts)** Electron host adapter for the substrate resource protocol.
- **[scaffold.ts](./scaffold.ts)** Creates a bare editable workspace from feature templates without discarding it when dependency installation fails.

<!-- INDEX:END -->
