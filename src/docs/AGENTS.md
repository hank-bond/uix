---
summary: "The shipped, user-facing substrate reference for building on UIX — surfaces, channels, agent, features, lifetimes, state — kept in lockstep with current code."
status: active
---

# UIX substrate documentation

User-facing documentation for the UIX substrate. Audience: someone (human or agent) building on UIX — writing a feature, contributing a surface, defining a channel, integrating with the pi agent session. If a doc here is wrong, either the doc or the code it describes is broken — update them together.

For the vision, see [`../../AGENTS.md`](../../AGENTS.md); for decisions and rationale, [`../../docs/decisions/`](../../docs/decisions/); for dev-facing architecture state, [`../../docs/architecture/`](../../docs/architecture/).

Pages marked _(stub)_ are placeholders that fill in as the corresponding primitive lands. Docs are tagged by **kind** — reference, how-to, or tutorial — the need they serve; reference describes the machinery, how-tos guide tasks, and the tutorial is the learning path.

## Pages

<!-- INDEX:START -->

<!-- Generated from each doc's frontmatter by scripts/docs-index.mjs — do not edit by hand; run `npm run docs:index`. -->

- **[add-a-channel](./add-a-channel.md)** _(stub, how-to)_ — How to add a channel to a feature: declare a schema-only ChannelContract, bind handlers, mint publishers, and consume the typed client. Placeholder to build when the channel contract lands. _Read when adding a channel to a feature, or when asked to add a channel._
- **[add-a-feature](./add-a-feature.md)** _(stub, how-to)_ — How to add a feature to a workspace: author an entry file with defineFeature, declare it in uix.workspace.json, and reload. _Read when adding a feature to a workspace, or when asked to add a feature._
- **[agent](./agent.md)** _(active, reference)_ — How the substrate drives the agent today: it lazily owns a persisted Pi AgentSessionRuntime, assembles feature system-prompt sections and Pi skills per runtime generation/reload, forwards a UIX-shaped event stream, exposes model controls, binds tools, and flushes agent context.
- **[channels](./channels.md)** _(stub, reference)_ — Feature channel contracts declare request handlers and backend-published events with shared schemas; the current Workspace client and preload bridge consume those contracts directly while the public packaged-feature API is still forming.
- **[contributions](./contributions.md)** _(active, reference)_ — FeatureDefinition.contribute returns facet contributions for resources, channels, agent tools, Agent system-prompt sections, Pi skills, turn state, agent context, and surfaces; the substrate registers each facet under the feature id with reload-scoped lifetimes.
- **[features](./features.md)** _(active, reference)_ — Feature entries are trusted local TS/JS modules listed explicitly in uix.workspace.json; each uses defineFeature to export `feature`, a settings-typed FeatureDefinition loaded with jiti, lifetime-scoped under the reload bag, and wired only through @uix/api.
- **[first-feature](./first-feature.md)** _(stub, tutorial)_ — The learning path for building a first feature end-to-end, with a checkable assertion per step. Placeholder to build by going through it. _Read when learning UIX feature authoring for the first time, or when an agent needs a worked exemplar of the house style._
- **[lifetimes](./lifetimes.md)** _(active, reference)_ — DisposableBag owns cleanup for app lifetime, reloadable feature activations, window bindings, and the agent driver; feature authors receive scoped capabilities rather than direct bag access.
- **[settings](./settings.md)** _(active, reference)_ — Durable settings in uix.workspace.json, two scopes: feature settings declared as TypeBox schemas and hydrated into manifest feature entries, and substrate-owned workspace namespaces for agent preferences, selected session state, and keybindings under top-level settings.
- **[state](./state.md)** _(active, reference)_ — UIX persists each pi session under its workspace state root, shares one app-owned Pi profile across workspaces, stores canvas documents in the local document store, and exposes feature-scoped durable JSON preferences through ctx.settings.

<!-- INDEX:END -->
