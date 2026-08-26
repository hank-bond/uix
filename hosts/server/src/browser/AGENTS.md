---
summary: "Browser-side server bootstraps for the catalog launcher and the stateless workspace shell's accepted live session."
---

# Server browser bootstrap

This directory is bundled for an ordinary browser. It owns the HTTP catalog request and browser navigation effects injected into the host-neutral launcher client. The workspace shell opens its page-matched live connection, validates the accepted `ready` frame, and replaces a workspace-only location with the canonical session location. W3 will mount the shared workspace client over canonical request and event frames.

<!-- INDEX:START -->

<!-- Generated from production source-file summaries, local Markdown frontmatter, and child AGENTS.md summaries. Do not edit by hand; run `npm run docs:index`. -->

### Source files

- **[launcher-adapter.ts](./launcher-adapter.ts)** Adapts the public workspace catalog to launcher listing and canonical browser navigation.
- **[launcher.html](./launcher.html)** Defines the server launcher document that boots the shared browser client.
- **[main.ts](./main.ts)** Boots the shared launcher client over the server catalog and browser navigation adapter.
- **[workspace-connection.ts](./workspace-connection.ts)** Opens one workspace page's live connection and canonicalizes its accepted session location.
- **[workspace-main.ts](./workspace-main.ts)** Boots the stateless workspace shell and owns its live session connection.
- **[workspace.html](./workspace.html)** Defines the stateless server workspace document that opens one live attachment.

<!-- INDEX:END -->
