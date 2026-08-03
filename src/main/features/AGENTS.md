---
summary: "The main-process feature runtime validates manifest composition, activates feature instances atomically, registers facets, builds surfaces, and scaffolds editable workspaces."
status: active
---

# Feature runtime

This directory owns the main-process mechanics for manifest-selected feature composition and bare workspace creation. Feature-author contracts remain under `src/api/`, while each facet registry owns its live members outside this directory.

The manifest parser validates persisted composition and resolves entry paths. The loader evaluates those entries, constructs injected context, and owns each activated feature instance. `contributions.ts` is the exhaustive adapter from `FeatureContributions` facets to their registries. The surface registry retains ordered entry paths, while the surface pipeline builds and serves renderer modules. Scaffolding creates an editable initial composition but does not participate in runtime activation.

Apply these invariants when changing this boundary:

- Validate a persisted workspace candidate before disposing the active feature composition.
- Activate entries sequentially in manifest order.
- Keep settings and facet registrations provisional until one feature activates completely.
- Roll back a failed feature without aborting sibling activation.
- Add a new feature facet through `FeatureContributions`, the registry bundle, grouped registration, and rollback tests together.
- Preserve manifest order and declaration order in the surface composition.
- Isolate one surface build failure, and let only the newest overlapping build replace served modules.
- Treat Jiti and Esbuild as loaders for trusted local code, not security boundaries.

## Contents

<!-- INDEX:START -->

<!-- Generated from source-file summaries, local Markdown frontmatter, and child AGENTS.md summaries. Do not edit by hand; run `npm run docs:index`. -->

### Source files

- **[contributions.test.ts](./contributions.test.ts)** Verifies feature facets register and roll back as one lifetime across registry, origin, and preflight failures.
- **[contributions.ts](./contributions.ts)** Registers one feature's contributed facets as one rollback-safe lifetime.
- **[loader.test.ts](./loader.test.ts)** Verifies manifest-driven feature loading, activation isolation, ordering, aliases, settings rollback, and reload teardown.
- **[loader.ts](./loader.ts)** Loads manifest-selected feature entries into isolated, reload-scoped activated instances.
- **[manifest.test.ts](./manifest.test.ts)** Verifies manifest parsing retains unrelated top-level fields while resolving ordered feature references.
- **[manifest.ts](./manifest.ts)** Validates workspace manifests and resolves ordered feature entry references to absolute paths.
- **[scaffold.test.ts](./scaffold.test.ts)** Verifies scaffolding copies editable templates, writes composition files, and separates copy failures from install failures.
- **[scaffold.ts](./scaffold.ts)** Creates bare workspaces from editable feature templates and reports non-fatal dependency-install failures.
- **[surface-pipeline.test.ts](./surface-pipeline.test.ts)** Verifies surface bundling, shared-module identity, CSS isolation, resource serving, cache busting, and overlapping-build replacement.
- **[surface-pipeline.ts](./surface-pipeline.ts)** Builds registered surface modules and serves hash-addressed bundles and feature files through substrate resources.
- **[surfaces.test.ts](./surfaces.test.ts)** Verifies surface path resolution, ordering, validation, and identity-safe disposal.
- **[surfaces.ts](./surfaces.ts)** Resolves and stores the ordered live surface composition contributed by active features.

<!-- INDEX:END -->
