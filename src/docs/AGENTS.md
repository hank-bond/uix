---
summary: "The shipped substrate reference covers features, surfaces, channels, agent integration, settings, state, and lifetimes in lockstep with code."
status: active
---

# UIX substrate documentation

This tree documents the UIX substrate for humans and agents building features, surfaces, channels, and Pi integrations. If a page and code disagree, update them together.

For the vision, see [`../../AGENTS.md`](../../AGENTS.md). For decisions and rationale, see [`../../docs/decisions/`](../../docs/decisions/). For dev-facing architecture state, see [`../../docs/architecture/`](../../docs/architecture/).

Pages marked _(stub)_ are in progress. Each document also has a _kind_. Reference maps machinery, how-to guides a task, and tutorial teaches through a learning path.

## Pages

<!-- INDEX:START -->

<!-- Generated from each doc's frontmatter by scripts/docs-index.mjs. Do not edit by hand; run `npm run docs:index`. -->

- **[agent-context](./agent-context.md)** _(active, reference)._ Features supply stable prompt sections, Pi skills, branch-scoped turn state, and hidden model-visible agent context through separate contribution facets.
- **[agent](./agent.md)** _(active, reference)._ UIX owns a lazy Pi runtime, exposes it through substrate channels, and installs manifest-composed agent facets without ambient built-in tools.
- **[contributions](./contributions.md)** _(active, reference)._ FeatureDefinition.contribute returns feature-owned resource, channel, agent, state, context, and surface facets under reload-scoped lifetimes.
- **[how-to/](./how-to/AGENTS.md)** _(active)._ Task-focused feature-authoring guides for implementing UIX applications, colocated with the framework and findable by the agents and builders who use it.
- **[lifetimes](./lifetimes.md)** _(active, reference)._ DisposableBag owns cleanup for app lifetime, reloadable feature activations, window bindings, and the agent driver. Feature authors receive scoped capabilities rather than direct bag access.
- **[models-and-authentication](./models-and-authentication.md)** _(active, reference)._ Pi owns model availability and provider authentication. UIX projects generic catalogs, workspace defaults, favorites, status, and one restorable login flow.
- **[sessions-and-transcripts](./sessions-and-transcripts.md)** _(active, reference)._ Selected Pi session graphs persist under each workspace, while UIX projects summaries, history, streaming items, and renderer session controls.
- **[state](./state.md)** _(active, reference)._ UIX separates workspace settings, Pi session graphs, feature turn state, document versions, renderer projections, and the application-owned Pi profile.

<!-- INDEX:END -->
