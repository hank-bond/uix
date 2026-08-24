---
summary: "Server-owned process and browser code implementing the HTTP host and mounting shared clients over server adapters."
---

# Server source

The process side owns configuration, private workspace resolution, public locations, HTTP routes, and listener lifetime. The browser side owns catalog transport and navigation adaptation before mounting `@uix/client`. Neither side changes workspace or feature contracts.

<!-- INDEX:START -->

<!-- Generated from production source-file summaries, local Markdown frontmatter, and child AGENTS.md summaries. Do not edit by hand; run `npm run docs:index`. -->

### Directories

- **[browser/](./browser/AGENTS.md)** Browser-side server bootstrap: validate the public catalog, adapt it to launcher capabilities, navigate canonical locations, and mount the shared launcher client.
- **[node/](./node/AGENTS.md)** Node-side server composition: boot-loaded workspace registration, public locations, launcher HTTP routes, listener startup, and deterministic host disposal.

<!-- INDEX:END -->
