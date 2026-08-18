---
summary: "Public browser-client mounts hide their current rendering framework and consume only host-constructed capability adapters."
---

# Browser client source

Each full-page client exposes a synchronous DOM mount returning an idempotent ECMAScript disposable. Concrete hosts own documents, origins, physical transports, URL encoding, and adapter construction. This package owns browser presentation and may use ordinary web APIs, but it never inspects host globals or imports runtime, host, app, or concrete-host implementations.

The launcher is live. The workspace client moves here in the next H5 slice.

## Contents

<!-- INDEX:START -->

<!-- Generated from production source-file summaries, local Markdown frontmatter, and child AGENTS.md summaries. Do not edit by hand; run `npm run docs:index`. -->

### Directories

- **[launcher/](./launcher/AGENTS.md)** The shared launcher renders host-known workspaces and optional creation through an opaque capability adapter.

### Source files

- **[index.ts](./index.ts)** Public browser-client entrypoints and host adapter contracts.
- **[launcher.ts](./launcher.ts)** Mounts the shared launcher page over host-provided catalog capabilities.

<!-- INDEX:END -->
