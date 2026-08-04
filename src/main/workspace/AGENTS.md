---
summary: "Workspace runtime code finds the manifest, keeps workspace and feature settings in sync, and coordinates safe reloads of features and Pi resources."
status: active
---

# Workspace runtime

Feature manifest shape and activation live in [`../features/`](../features/AGENTS.md); the generic settings registry, turn-state mechanics, and agent runtime remain sibling owners.

The workspace manifest is both the selected feature composition and the durable location for feature and substrate settings. Settings adoption stages a manifest generation, validates and hydrates every workspace namespace while detached, and only then promotes the generation. Only after promotion does the settings registry receive the generation's locations. Feature settings locations remain bound to the manifest generation and manifest index selected by the feature loader.

Whole-workspace reload coordinates independently owned transitions. It commits current turn state, replaces feature activation, reloads Pi resources, restores replacement feature state, then publishes the resulting surface composition. Keep that lifecycle coordination here rather than making any participant enroll itself.

## Contents

<!-- INDEX:START -->

<!-- Generated from production source-file summaries, local Markdown frontmatter, and child AGENTS.md summaries. Do not edit by hand; run `npm run docs:index`. -->

### Source files

- **[manifest-store.ts](./manifest-store.ts)** Reads workspace manifests into staged copies and atomically writes the accepted copy back to disk.
- **[reload.ts](./reload.ts)** Runs one workspace reload at a time across feature activation, Pi resources, restored state, and renderer notification.
- **[roots.ts](./roots.ts)** Finds stable paths for workspace state, the agent working directory, and the manifest from one startup target.
- **[settings-namespace.ts](./settings-namespace.ts)** Defines a named, schema-checked group of workspace settings.
- **[settings.ts](./settings.ts)** Validates a staged manifest's settings, makes them live together, and connects them to their persisted locations.

<!-- INDEX:END -->
