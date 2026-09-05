---
summary: "The Electron main process composes supervised workspace runtimes over native windows, IPC, the resource protocol, launcher operations, and awaited process teardown."
---

# Electron main process

`index.ts` is the Electron composition root. It creates the shared `WorkspaceSupervisor`, provides Electron resource and provider-link adapters to `@uix/runtime`, and binds each workspace window's `webContents` to one guard and attachment. Main-process code owns windows, menus, launcher transitions, recents, dialogs, IPC wire logging, and the privileged resource protocol.

Explicit host, window, launcher, and connection lifetimes own cleanup-producing bindings through `lifecycle.ts`. Synchronous host bindings enter `DisposableBag`, while the workspace supervisor enters `AsyncDisposableBag`. The host prevents the first `before-quit`, drains both, and resumes Electron shutdown only after supervised runtime teardown settles.

<!-- INDEX:START -->

<!-- Generated from production source-file summaries, local Markdown frontmatter, and child AGENTS.md summaries. Do not edit by hand; run `npm run docs:index`. -->

### Source files

- **[attachment-web-binding-state.ts](./attachment-web-binding-state.ts)** Projects one Electron attachment's binding into revisioned host control snapshots.
- **[external-links.ts](./external-links.ts)** Contains renderer navigation while delegating approved web URLs to the operating system.
- **[index.ts](./index.ts)** Starts the discrete Electron host over shared supervision, runtime, and browser clients.
- **[ipc-wire-log.ts](./ipc-wire-log.ts)** Writes each IPC request or event to the terminal log and, when enabled, a raw file log.
- **[ipc.ts](./ipc.ts)** Relays requests from the renderer to main and sends events back through one logged IPC boundary.
- **[lifecycle.ts](./lifecycle.ts)** Electron-side lifetime helpers.
- **[recents.ts](./recents.ts)** Persists a bounded newest-first list of workspace manifests that still exist.
- **[resource-transport.ts](./resource-transport.ts)** Adapts Electron's privileged protocol to guarded workspace resources and viewpoint routes.
- **[scaffold.ts](./scaffold.ts)** Creates a bare editable workspace from feature templates without discarding it when dependency installation fails.

<!-- INDEX:END -->
