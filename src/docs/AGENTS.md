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

- **[agent](./agent.md)** _(active)_ — How the cockpit drives the agent today: it lazily owns a persisted pi AgentSession, forwards a UIX-shaped event stream to the renderer, delegates reload, binds the core anchored document read/write/edit tools, and flushes registered state messages as display-hidden custom entries at each turn boundary.
- **[channels](./channels.md)** _(stub)_ — No public typed pane/channel API ships yet; the current cross-boundary surface is the typed Electron IPC bridge (prompts, agent events, canvas invalidation, manual refresh, reload).
- **[contributions](./contributions.md)** _(active)_ — Extension entry files can call registerCommand only; the registration is logged and lifetime-scoped but not yet invokable through a command registry.
- **[extensions](./extensions.md)** _(active)_ — Trusted local TS/JS packages default-export a factory that receives the injected type-only @uix/api; entries are discovered from .uix/extensions and ~/.uix/extensions, loaded with jiti, and lifetime-scoped across reloads.
- **[lifetimes](./lifetimes.md)** _(active)_ — DisposableBag owns cleanup for the app, extension reload, window registrations, and the agent driver; extension authors get cleanup only through registrations made on the injected API.
- **[panes](./panes.md)** _(active)_ — The renderer ships a hardcoded chat pane and a hardcoded canvas iframe pane; the chat pane renders TranscriptItems as scoped chat blocks, and the canvas is key-addressed, served over own-origin uix-canvas:// URLs, sandboxed, refreshed by whole-document iframe reload, and served with a writeback shim.
- **[state](./state.md)** _(active)_ — The cockpit uses an in-memory pi session and stores canvas HTML by key under .uix/canvas; there is no public UIX-extension state API yet beyond lifetime-scoped registerCommand cleanup.

<!-- INDEX:END -->
