---
summary: "The shipped, user-facing substrate reference for building on UIX — panes, channels, agent, extensions, lifetimes, state — kept in lockstep with current code."
status: active
---

# UIX substrate documentation

User-facing documentation for the UIX substrate. Audience: someone (human or agent) building on UIX — writing an extension, contributing a pane, defining a channel, integrating with the pi agent session. If a doc here is wrong, either the doc or the code it describes is broken — update them together.

For the vision, see [`../../AGENTS.md`](../../AGENTS.md); for decisions and rationale, [`../../docs/decisions/`](../../docs/decisions/); for dev-facing architecture state, [`../../docs/architecture/`](../../docs/architecture/).

Pages marked _(stub)_ are placeholders that fill in as the corresponding primitive lands.

## Pages

<!-- INDEX:START -->

<!-- Generated from each doc's frontmatter by scripts/docs-index.mjs — do not edit by hand; run `npm run docs:index`. -->

- **[agent](./agent.md)** _(active)_ — How the cockpit drives the agent today: it lazily owns a persisted pi AgentSession, forwards a UIX-shaped event stream to the renderer, delegates reload, binds the core anchored document read/write/edit tools, and flushes registered agent-context contributions as display-hidden custom entries at agent-run prep.
- **[channels](./channels.md)** _(stub)_ — Feature channel contracts declare request handlers and backend-published events with shared schemas; the current Workspace client and preload bridge consume those contracts directly while the public packaged-feature API is still forming.
- **[contributions](./contributions.md)** _(active)_ — Extension entry files can call registerCommand only; the registration is logged and lifetime-scoped but not yet invokable through a command registry.
- **[extensions](./extensions.md)** _(active)_ — Trusted local TS/JS packages default-export a factory that receives the injected type-only @uix/api; entries are discovered from .uix/extensions and ~/.uix/extensions, loaded with jiti, and lifetime-scoped across reloads.
- **[lifetimes](./lifetimes.md)** _(active)_ — DisposableBag owns cleanup for the app, extension reload, window registrations, and the agent driver; extension authors get cleanup only through registrations made on the injected API.
- **[state](./state.md)** _(active)_ — The cockpit uses an in-memory pi session and stores canvas HTML in the local document store; there is no public UIX-extension state API yet beyond lifetime-scoped registerCommand cleanup.

<!-- INDEX:END -->
