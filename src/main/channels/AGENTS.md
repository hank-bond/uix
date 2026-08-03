---
summary: "The main-process channel registry binds schema-validated feature requests and typed event publishers to an injected transport under feature-owned identities."
status: active
---

# Channel registry

This directory owns the live main-process registry for channel requests and feature-scoped event publication. Shared author contracts, type derivation, and canonical-id resolution remain under `src/api/`; the composition root supplies the Electron transport adapter.

Apply these invariants when changing this boundary:

- Validate unknown requests before feature handlers and validate responses before transport return.
- Reserve each canonical request id once, then release it even when transport acquisition or disposal throws.
- Require a contribution contract and event publisher to match the feature namespace that receives it.
- Register grouped request contributions atomically so one failure removes earlier handlers.
- Preserve request, response, and event log descriptions through the transport boundary.
- Keep the registry transport-neutral; Electron-specific handling belongs in the adapter.

## Contents

<!-- INDEX:START -->

<!-- Generated from source-file summaries, local Markdown frontmatter, and child AGENTS.md summaries. Do not edit by hand; run `npm run docs:index`. -->

### Source files

- **[registry.test.ts](./registry.test.ts)** Verifies channel validation, ownership, grouped rollback, transport cleanup, event publication, and sensitive log descriptions.
- **[registry.ts](./registry.ts)** Owns live channel request registrations and feature-scoped event publication over an injected transport.

<!-- INDEX:END -->
