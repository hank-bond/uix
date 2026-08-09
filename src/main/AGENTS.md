---
summary: "The Electron host starts the app, opens one workspace, wires transport adapters around the @uix/runtime, and owns the shell chrome."
---

# Electron host

`index.ts` is the host shell: app lifecycle, windows, menu, picker, recents, and native dialogs. For each open workspace it instantiates one `@uix/runtime` workspace runtime with Electron adapters. The adapters are the IPC channel transport, the resource protocol binding, `shell.openExternal`, and the profile/api dirs. The runtime owns everything workspace-bound. The host owns the platform.

IPC remains the Electron transport binding behind the runtime's channel port. The resource protocol adapter in `resource-transport.ts` binds the runtime's dispatch to the `uix-resource://` scheme. All cleanup-producing bindings join explicit application or window lifetimes through `lifecycle.ts`.

## Contents

<!-- INDEX:START -->

<!-- Generated from production source-file summaries, local Markdown frontmatter, and child AGENTS.md summaries. Do not edit by hand; run `npm run docs:index`. -->

### Source files

- **[external-links.ts](./external-links.ts)** Contains renderer navigation while delegating approved web URLs to the operating system.
- **[index.ts](./index.ts)** Starts the Electron app, opens a workspace, and owns the host shell around the @uix/runtime workspace runtime.
- **[ipc-wire-log.ts](./ipc-wire-log.ts)** Writes each IPC request or event to the terminal log and, when enabled, a raw file log.
- **[ipc.ts](./ipc.ts)** Relays requests from the renderer to main and sends events back through one logged IPC boundary.
- **[lifecycle.ts](./lifecycle.ts)** Provides Electron-host disposable helpers that bind app, window, and webContents listeners to their owners.
- **[recents.ts](./recents.ts)** Persists a bounded newest-first list of workspace manifests that still exist.
- **[resource-transport.ts](./resource-transport.ts)** Binds the substrate resource protocol to Electron's custom protocol machinery.

<!-- INDEX:END -->
