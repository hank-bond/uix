---
summary: "Public browser-client mounts hide their current rendering framework and consume only host-constructed capability adapters."
---

# Browser client source

Each full-page client exposes a synchronous DOM mount returning an idempotent ECMAScript disposable. Concrete hosts own documents, origins, physical transports, URL encoding, and adapter construction. This package owns browser presentation and may use ordinary web APIs, but it never inspects host globals or imports runtime, host, app, or concrete-host implementations.

The launcher and workspace mounts are live.

## Contents

<!-- INDEX:START -->

<!-- Generated from production source-file summaries, local Markdown frontmatter, and child AGENTS.md summaries. Do not edit by hand; run `npm run docs:index`. -->

### Directories

- **[launcher/](./launcher/AGENTS.md)** The shared launcher renders host-known workspaces and optional creation through an opaque capability adapter.
- **[workspace/](./workspace/AGENTS.md)** The shared workspace client hosts runtime surfaces and owns session, action, and keybinding projections over a host-constructed channel client.

### Source files

- **[index.ts](./index.ts)** Public browser-client entrypoints and host adapter contracts.
- **[launcher.ts](./launcher.ts)** Mounts the shared launcher page over host-provided catalog capabilities.
- **[workspace.ts](./workspace.ts)** Mounts the shared workspace page over a host-constructed channel client.

<!-- INDEX:END -->
