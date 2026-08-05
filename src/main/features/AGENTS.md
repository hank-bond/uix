---
summary: "The feature runtime loads the workspace's chosen features, isolates failed activations, builds their renderer surfaces, and scaffolds bare editable workspaces."
status: active
---

# Feature runtime

Feature-author contracts remain under `src/api/`. The workspace runtime supplies accepted manifest generations, and sibling facet registries own live contributed members.

Feature activation coordinates `manifest.ts`, `loader.ts`, and `contributions.ts`: manifest order is authoritative. Feature ids `agent` and `uix` are reserved for the substrate's own contracts. `loader.ts` rejects a feature that claims one, so a feature cannot register under another owner's namespace. Each feature's settings and facet registrations remain provisional until its activation succeeds, and one failed feature rolls back without aborting siblings. Adding a facet therefore changes the public contribution contract, registry bundle, grouped registration, and activation rollback coverage together.

Surface delivery coordinates `surfaces.ts` with `surface-pipeline.ts`. Preserve manifest and declaration order from registration through renderer composition. `scaffold.ts` is a separate authoring path that creates editable initial composition and does not participate in runtime activation.

## Contents

<!-- INDEX:START -->

<!-- Generated from production source-file summaries, local Markdown frontmatter, and child AGENTS.md summaries. Do not edit by hand; run `npm run docs:index`. -->

### Source files

- **[contributions.ts](./contributions.ts)** Registers all of one feature's capabilities together and rolls them all back if any registration fails.
- **[loader.ts](./loader.ts)** Loads the features selected by the workspace manifest and isolates failures so one feature cannot stop its siblings.
- **[manifest.ts](./manifest.ts)** Validates workspace manifests and resolves each ordered feature entry to an absolute path.
- **[scaffold.ts](./scaffold.ts)** Creates a bare editable workspace from feature templates without discarding it when dependency installation fails.
- **[surface-pipeline.ts](./surface-pipeline.ts)** Builds each active surface for the renderer and serves its code, styles, and feature files through resource URLs.
- **[surfaces.ts](./surfaces.ts)** Resolves feature surface entry paths and retains active surfaces in workspace and declaration order.

<!-- INDEX:END -->
