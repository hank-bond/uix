---
summary: "Browser-side server bootstrap: validate the public catalog, adapt it to launcher capabilities, navigate canonical locations, and mount the shared launcher client."
---

# Server browser bootstrap

This directory is bundled for an ordinary browser. It owns the HTTP catalog request and browser navigation effects injected into the host-neutral launcher client.

<!-- INDEX:START -->

<!-- Generated from production source-file summaries, local Markdown frontmatter, and child AGENTS.md summaries. Do not edit by hand; run `npm run docs:index`. -->

### Source files

- **[launcher-adapter.ts](./launcher-adapter.ts)** Adapts the public workspace catalog to launcher listing and canonical browser navigation.
- **[launcher.html](./launcher.html)** Defines the server launcher document that boots the shared browser client.
- **[main.ts](./main.ts)** Boots the shared launcher client over the server catalog and browser navigation adapter.

<!-- INDEX:END -->
