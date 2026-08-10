---
summary: "Explicit app compositions. Reusable app-layer features and reference workspace manifests are never globally discovered. Every manifest selects its entries explicitly."
read_when: "Deciding whether code is an app feature or belongs in the substrate, or composing a workspace."
---

# Apps

Apps are explicit compositions: a host plus a workspace and feature composition. Entries under `apps/features` are reusable source catalogs, not compiled-in defaults; entries under `apps/workspaces` are manifests with optional local feature source. Hosts never install app features silently, and the core runtime and hosts build without importing this tree. Feature implementations import author contracts only.

<!-- INDEX:START -->

<!-- Generated from each doc's frontmatter by scripts/docs-index.mjs. Do not edit by hand; run `npm run docs:index`. -->

- **[features/](./features/AGENTS.md)** _(stub)._ Reusable app-layer feature implementations such as Chat, Canvas, and workspace tools, manifest-selected rather than globally discovered. _Writing or reusing an app feature implementation, or deciding a feature belongs in the substrate._
- **[workspaces/](./workspaces/AGENTS.md)** _(stub)._ Explicit workspace compositions: repository dogfood and product manifests with optional local feature source beside them. _Composing a workspace manifest or a product composition._

<!-- INDEX:END -->
