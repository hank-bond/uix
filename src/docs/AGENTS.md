---
summary: "The shipped, user-facing substrate reference for building on UIX — surfaces, channels, agent, features, lifetimes, state — kept in lockstep with current code."
status: active
---

# UIX substrate documentation

User-facing documentation for the UIX substrate. Audience: someone (human or agent) building on UIX — writing a feature, contributing a surface, defining a channel, integrating with the pi agent session. If a doc here is wrong, either the doc or the code it describes is broken — update them together.

For the vision, see [`../../AGENTS.md`](../../AGENTS.md); for decisions and rationale, [`../../docs/decisions/`](../../docs/decisions/); for dev-facing architecture state, [`../../docs/architecture/`](../../docs/architecture/).

Pages marked _(stub)_ are placeholders that fill in as the corresponding primitive lands.

## Pages

<!-- INDEX:START -->

<!-- Generated from each doc's frontmatter by scripts/docs-index.mjs — do not edit by hand; run `npm run docs:index`. -->

- **[agent](./agent.md)** _(active)_ — How the substrate drives the agent today: it lazily owns a persisted pi AgentSession, forwards a UIX-shaped event stream to the renderer, exposes model list/favorite/status/select channels over pi's model registry, delegates reload, binds the core anchored document read/write/edit tools, and flushes registered agent-context contributions as display-hidden custom entries at agent-run prep.
- **[channels](./channels.md)** _(stub)_ — Feature channel contracts declare request handlers and backend-published events with shared schemas; the current Workspace client and preload bridge consume those contracts directly while the public packaged-feature API is still forming.
- **[contributions](./contributions.md)** _(active)_ — FeatureDefinition.contribute returns facet contributions for resources, channels, agent tools, turn state, agent context, and surfaces; the substrate registers each facet under the feature id with reload-scoped lifetimes.
- **[features](./features.md)** _(active)_ — Feature entries are trusted local TS/JS modules listed explicitly in uix.workspace.json; each default-exports a FeatureDefinition loaded with jiti, lifetime-scoped under the reload bag, and wired only through @uix/api.
- **[lifetimes](./lifetimes.md)** _(active)_ — DisposableBag owns cleanup for app lifetime, reloadable feature activations, window registrations, and the agent driver; feature authors get cleanup through registered contributions rather than direct bag access.
- **[settings](./settings.md)** _(active)_ — Durable settings in uix.workspace.json, two scopes: feature settings declared as TypeBox schemas and hydrated into manifest feature entries, and substrate-owned workspace namespaces (e.g. agent model defaults and favorites) under top-level settings.
- **[state](./state.md)** _(active)_ — UIX persists each pi session under its workspace state root, shares one app-owned Pi profile across workspaces, stores canvas documents in the local document store, and exposes feature-scoped durable JSON preferences through ctx.settings.

<!-- INDEX:END -->
