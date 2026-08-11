---
summary: "The Electron host composition starts the app, opens one workspace runtime over Electron ports, and owns windows, menu, picker, recents, and the transports."
---

# Main process (Electron host)

`index.ts` is the host composition root. It constructs exactly one workspace runtime from `@uix/runtime` over Electron ports: the IPC channel transport, the `uix-resource` protocol transport, and `shell.openExternal`. It owns the shell chrome around that runtime: windows, the workspace menu, the start picker, recents, and the reload IPC channel. The workspace substrate itself lives in `@uix/runtime`. The H7 unit moves this host composition under `hosts/electron`.

Cleanup-producing bindings join explicit application, window, or picker lifetimes through `lifecycle.ts` (the host-neutral helpers re-exported from `@uix/runtime/lifecycle`). IPC remains a transport boundary: `ipc.ts` records every crossing and the channel registry inside the runtime binds resolved contributions to the transport provided here.

## Contents

<!-- INDEX:START -->

<!-- Generated from production source-file summaries, local Markdown frontmatter, and child AGENTS.md summaries. Do not edit by hand; run `npm run docs:index`. -->

### Source files

- **[external-links.ts](./external-links.ts)** Contains renderer navigation while delegating approved web URLs to the operating system.
- **[index.ts](./index.ts)** Starts the Electron app, opens a workspace, and owns the lifetimes of its windows and host chrome.
- **[ipc-wire-log.ts](./ipc-wire-log.ts)** Writes each IPC request or event to the terminal log and, when enabled, a raw file log.
- **[ipc.ts](./ipc.ts)** Relays requests from the renderer to main and sends events back through one logged IPC boundary.
- **[lifecycle.ts](./lifecycle.ts)** Electron-side lifetime helpers.
- **[recents.ts](./recents.ts)** Persists a bounded newest-first list of workspace manifests that still exist.
- **[resource-transport.ts](./resource-transport.ts)** Electron host adapter for the substrate resource protocol.
- **[scaffold.ts](./scaffold.ts)** Creates a bare editable workspace from feature templates without discarding it when dependency installation fails.

<!-- INDEX:END -->
