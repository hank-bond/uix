---
summary: "The shipped substrate reference covers features, surfaces, channels, agent integration, settings, state, and lifetimes in lockstep with code."
status: active
---

# UIX substrate documentation

This tree documents the UIX substrate for humans and agents building features, surfaces, channels, and Pi integrations. If a page and code disagree, update them together.

For the vision, see [`../../AGENTS.md`](../../AGENTS.md); for decisions and rationale, [`../../docs/decisions/`](../../docs/decisions/); for dev-facing architecture state, [`../../docs/architecture/`](../../docs/architecture/).

Pages marked _(stub)_ are in progress. Each document also has a _kind_. Reference maps machinery, how-to guides a task, and tutorial teaches through a learning path.

## Pages

<!-- INDEX:START -->

<!-- Generated from each doc's frontmatter by scripts/docs-index.mjs — do not edit by hand; run `npm run docs:index`. -->

- **[actions](./actions.md)** _(active, reference)_ — Feature surfaces register renderer action trees; the workspace derives catalogs, invokes ids, materializes defaults, and disables conflicted keybindings.
- **[add-a-channel](./add-a-channel.md)** _(stub, how-to)_ — How to add a channel to a feature: declare a schema-only ChannelContract, bind handlers, mint publishers, and consume the typed client. Placeholder to build when the channel contract lands. _Read when adding a channel to a feature, or when asked to add a channel._
- **[add-a-feature](./add-a-feature.md)** _(stub, how-to)_ — How to add a feature to a workspace: author an entry file with defineFeature, declare it in uix.workspace.json, and reload. _Read when adding a feature to a workspace, or when asked to add a feature._
- **[agent](./agent.md)** _(active, reference)_ — UIX owns a lazy Pi runtime, exposes it through substrate channels, and installs manifest-composed agent facets without ambient built-in tools.
- **[agent-context](./agent-context.md)** _(active, reference)_ — Features supply stable prompt sections, Pi skills, branch-scoped turn state, and hidden model-visible agent context through separate contribution facets.
- **[channels](./channels.md)** _(active, reference)_ — Shared ChannelContract values derive validated backend handlers, feature-bound event publishers, and typed workspace request and event clients.
- **[contributions](./contributions.md)** _(active, reference)_ — FeatureDefinition.contribute returns feature-owned resource, channel, agent, state, context, and surface facets under reload-scoped lifetimes.
- **[features](./features.md)** _(active, reference)_ — Manifest-listed trusted TypeScript or JavaScript entries export settings-typed feature definitions that Jiti loads through reload-scoped @uix/api wiring.
- **[first-feature](./first-feature.md)** _(stub, tutorial)_ — The learning path for building a first feature end-to-end, with a checkable assertion per step. Placeholder to build by going through it. _Read when learning UIX feature authoring for the first time, or when an agent needs a worked exemplar of the house style._
- **[lifetimes](./lifetimes.md)** _(active, reference)_ — DisposableBag owns cleanup for app lifetime, reloadable feature activations, window bindings, and the agent driver; feature authors receive scoped capabilities rather than direct bag access.
- **[models-and-authentication](./models-and-authentication.md)** _(active, reference)_ — Pi owns model availability and provider authentication; UIX projects generic catalogs, workspace defaults, favorites, status, and one restorable login flow.
- **[resources](./resources.md)** _(active, reference)_ — Feature resources declare normalized routes and handlers while shared address handles create validated workspace-origin or feature-origin browser URLs.
- **[sessions-and-transcripts](./sessions-and-transcripts.md)** _(active, reference)_ — Selected Pi session graphs persist under each workspace, while UIX projects summaries, history, streaming items, and renderer session controls.
- **[settings](./settings.md)** _(active, reference)_ — Workspace manifests store schema-validated feature settings and substrate-owned agent, session, and keybinding namespaces with materialized defaults.
- **[state](./state.md)** _(active, reference)_ — UIX separates workspace settings, Pi session graphs, feature turn state, document versions, renderer projections, and the application-owned Pi profile.
- **[surfaces](./surfaces.md)** _(active, reference)_ — Feature surface modules export defineSurface results that the workspace bundles, mounts, channel-binds, style-scopes, and isolates behind error boundaries.

<!-- INDEX:END -->
