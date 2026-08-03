---
summary: "Workspace runtime code resolves workspace identity, adopts durable manifest generations, binds settings, and coordinates whole-workspace replacement."
status: active
---

# Workspace runtime

This directory owns the workspace lifecycle above feature activation and below the application composition root. Feature manifest shape and activation live in [`../features/`](../features/AGENTS.md); the generic settings registry, turn-state mechanics, and agent runtime remain sibling owners.

The workspace manifest is both the selected feature composition and the durable location for feature and substrate settings. Settings adoption stages a manifest generation, validates and hydrates every workspace namespace while detached, and only then promotes the generation and exposes its locations to the settings registry. Feature settings locations remain bound to the manifest generation and manifest index selected by the feature loader.

Whole-workspace reload coordinates independently owned transitions: commit current turn state, replace feature activation, reload Pi resources, restore replacement feature state, then publish the resulting surface composition. Keep that lifecycle coordination here rather than making any participant enroll itself.

## Contents

<!-- INDEX:START -->

<!-- Generated from production source-file summaries, local Markdown frontmatter, and child AGENTS.md summaries. Do not edit by hand; run `npm run docs:index`. -->

### Source files

- **[manifest-store.ts](./manifest-store.ts)** Stages, adopts, and atomically persists mutable generations of one workspace manifest.
- **[reload.ts](./reload.ts)** Serializes whole-workspace replacement across feature, Pi-resource, turn-state, and renderer boundaries.
- **[roots.ts](./roots.ts)** Resolves stable workspace storage, agent working, and manifest paths from one startup target.
- **[settings-namespace.ts](./settings-namespace.ts)** Defines typed workspace-owned settings namespaces used to mint schema-bound handles.
- **[settings.ts](./settings.ts)** Adopts validated manifest generations and binds workspace and feature settings to their owned locations.

<!-- INDEX:END -->
