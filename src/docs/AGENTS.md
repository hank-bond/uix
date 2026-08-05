---
summary: "User-implementation guides for building UIX applications, colocated with the framework and findable by the agents and builders who use it."
---

# UIX implementation guides

These guides walk an implementer through a concrete feature-authoring task, each step ending in a checkable result. We wrote them for builders and agents making their own UIX applications: the "what do I need to know to implement my app" layer. They sit inside `src/` so they stay colocated with the code they reference.

Reference facts live in the `@uix/api` contracts and source summaries. These pages add the worked sequence and the implementation logic the docs don't provide. Revisit a guide whenever the contribution it exercises changes.

For the vision, see [`../../AGENTS.md`](../../AGENTS.md). For decisions and rationale, see [`../../docs/decisions/`](../../docs/decisions/). For dev-facing architecture state, see [`../../docs/architecture/`](../../docs/architecture/).

## Guides

<!-- INDEX:START -->

<!-- Generated from each doc's frontmatter by scripts/docs-index.mjs. Do not edit by hand; run `npm run docs:index`. -->

- **[add-a-channel](./add-a-channel.md)** _(how-to)._ Add a typed channel: declare a schema-only contract, bind handlers, publish events, and consume the client from a surface. _Read when adding a channel to a feature, or when asked to add a channel._
- **[add-a-feature](./add-a-feature.md)** _(how-to)._ Add a feature to a workspace: author the entry with defineFeature, declare it in uix.workspace.json, and reload. _Read when adding a feature to a workspace, or when asked to add a feature._
- **[add-a-resource](./add-a-resource.md)** _(how-to)._ Add a resource to a feature: declare an address handle in shared code, contribute a handler, and create transport URLs and origins. _Read when adding a resource to a feature, or when asked to add a resource._
- **[add-a-surface](./add-a-surface.md)** _(how-to)._ Add a surface to a feature: author an entry with defineSurface, bind a channel contract, and mount it in the workspace. _Read when adding a surface to a feature, or when asked to add a surface._
- **[add-an-action](./add-an-action.md)** _(how-to)._ Add an action to a feature: register a nested action tree with useActionContribution and invoke it from a surface. _Read when adding an action to a feature, or when asked to add an action._
- **[add-settings-to-a-feature](./add-settings-to-a-feature.md)** _(how-to)._ Add settings to a feature: declare a shared schema and default, read and write through ctx.settings, and consume them from a surface. _Read when adding settings to a feature, or when asked to add settings to a feature._

<!-- INDEX:END -->
