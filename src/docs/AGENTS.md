# UIX substrate documentation

User-facing documentation for the UIX substrate. Audience: someone (human or agent) building on UIX — writing an extension, contributing a pane, defining a channel, integrating with the pi agent session. If a doc here is wrong, either the doc or the code it describes is broken — update them together.

For the vision, see [`../../AGENTS.md`](../../AGENTS.md); for decisions and rationale, [`../../docs/decisions/`](../../docs/decisions/); for dev-facing architecture state, [`../../docs/architecture/`](../../docs/architecture/).

Pages marked _(stub)_ are placeholders that fill in as the corresponding primitive lands.

## Pages

<!-- INDEX:START -->

- **[agent](./agent.md)** _(active)_ — Current agent integration in UIX: the cockpit lazily owns an in-memory pi AgentSession, forwards a small event stream to the renderer, supports reload delegation, and binds the core anchored document read/write/edit tools. Read when working with the current agent driver or document tools.
- **[channels](./channels.md)** _(stub)_ — Current channel state in UIX: no public typed pane/channel API is implemented yet; the shipped cross-boundary surface is the typed Electron IPC bridge for prompts, agent events, canvas invalidation, manual canvas refresh, and reload. Read before depending on channel behavior.
- **[contributions](./contributions.md)** _(active)_ — Current contribution surface in UIX: extension entry files can call registerCommand only, and that command registration is logged/lifetime-scoped but not invokable through a command registry yet. Read before adding or relying on contribution points.
- **[extensions](./extensions.md)** _(active)_ — How current UIX extensions load: trusted local TypeScript/JavaScript package entries default-export a factory that receives the injected type-only @uix/api surface; packages are discovered from .uix/extensions and ~/.uix/extensions, loaded with jiti, and lifetime-scoped across reloads. Read when authoring or loading an extension today.
- **[lifetimes](./lifetimes.md)** _(active)_ — Current lifetime model in UIX: DisposableBag owns cleanup for app, extension reload, window registrations, and the agent driver; extension authors receive cleanup only through registrations made on the injected API. Read when checking cleanup/reload behavior.
- **[panes](./panes.md)** _(active)_ — Current pane behavior in UIX: the renderer has a hardcoded conversation pane and a hardcoded canvas iframe pane; the canvas is key-addressed, served over own-origin uix-canvas:// URLs, sandboxed, and refreshed by whole-document iframe reload. Read when working on current panes or canvas rendering.
- **[state](./state.md)** _(active)_ — Current state persistence in UIX: the cockpit uses an in-memory pi session, stores canvas HTML by key under .uix/canvas, and exposes no public UIX-extension state API beyond lifetime-scoped registerCommand cleanup. Read before storing state through UIX today.

<!-- INDEX:END -->
