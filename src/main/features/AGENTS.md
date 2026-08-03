---
summary: "The main-process feature runtime validates manifest composition, activates feature instances atomically, registers facets, builds surfaces, and scaffolds editable workspaces."
status: active
---

# Feature runtime

This directory owns main-process feature composition and renderer-surface delivery. Feature-author contracts remain under `src/api/`; the workspace runtime supplies accepted manifest generations, and sibling facet registries own live contributed members.

Feature activation coordinates `manifest.ts`, `loader.ts`, and `contributions.ts`: manifest order is authoritative, each feature's settings and facet registrations remain provisional until its activation succeeds, and one failed feature rolls back without aborting siblings. Adding a facet therefore changes the public contribution contract, registry bundle, grouped registration, and activation rollback coverage together.

Surface delivery coordinates `surfaces.ts` with `surface-pipeline.ts`. Preserve manifest and declaration order from registration through renderer composition. `scaffold.ts` is a separate authoring path that creates editable initial composition and does not participate in runtime activation.

## Contents

<!-- INDEX:START -->

<!-- Generated from production source-file summaries, local Markdown frontmatter, and child AGENTS.md summaries. Do not edit by hand; run `npm run docs:index`. -->

### Source files

- **[contributions.ts](./contributions.ts)** Registers one feature's contributed facets as one rollback-safe lifetime.
- **[loader.ts](./loader.ts)** Loads manifest-selected feature entries into isolated, reload-scoped activated instances.
- **[manifest.ts](./manifest.ts)** Validates workspace manifests and resolves ordered feature entry references to absolute paths.
- **[scaffold.ts](./scaffold.ts)** Creates bare workspaces from editable feature templates and reports non-fatal dependency-install failures.
- **[surface-pipeline.ts](./surface-pipeline.ts)** Builds registered surface modules and serves hash-addressed bundles and feature files through substrate resources.
- **[surfaces.ts](./surfaces.ts)** Resolves and stores the ordered live surface composition contributed by active features.

<!-- INDEX:END -->
