# Trellis

Trellis is a local Electron cockpit for building bidirectional human-agent surfaces on top of pi.

Pi is the agent framework: sessions, tools, prompts, skills, extensions, model providers, and agent events. Trellis is the UI substrate: panes, channels, contribution points, and the bridge between agent tool calls and frontend state.

The goal is not to build one fixed app. The goal is to provide the wiring primitives needed to build many local agent-facing apps: reports, dashboards, knowledge tools, design-system-backed deliverables, and interactive canvases.

## Core idea

The atomic Trellis unit is a pane.

A pane is:

1. a render surface, and
2. a typed event channel.

The render surface lets an extension show UI to the human. The channel lets that UI communicate with other panes, with extension state, and optionally with the pi agent.

Everything else is layered on top.

## Layers

```text
pi
  agent sessions, tools, prompts, skills, extensions, model providers

Trellis main process
  extension loading, lifetimes, agent session ownership, file watching

Trellis renderer shell
  slots, pane host, chrome, layout, channel routing

Trellis extensions
  panes, tools, declarative contributions, state schemas, docs

Pane content
  React components, iframe-rendered HTML, or declarative UI rendered by Trellis
```

Pi and Trellis are separate systems. A package may contribute to both:

```json
{
  "pi": {
    "extensions": ["./pi/index.ts"],
    "skills": ["./pi/skills"]
  },
  "trellis": {
    "extension": "./trellis/manifest.ts"
  }
}
```

The `pi` field teaches the agent new backend capabilities. The `trellis` field teaches the cockpit new frontend capabilities.

## Substrate primitives

The cockpit provides exactly these primitives. Anything not in this list is an extension responsibility.

| Primitive | Purpose |
|---|---|
| **Extension loader** | Discover, load, activate, hot-reload extensions. |
| **Pane host + slot registry** | Mount React, iframe, or declarative render surfaces into named slots. |
| **Typed channel** | Bidirectional bus carrying validated events between panes and the agent. |
| **Lifetime bags** | Per-extension `DisposableBag`. Disposes everything an extension registered. |
| **Agent session manager** | Owns the pi session, collects tool contributions, routes channel events to pi. |
| **File watcher service** | Cockpit-owned watcher; extensions register glob → callback. |

The cockpit shell (window, slot layout, error boundaries) sits underneath these primitives but is not itself extensible.

## Extension model

Trellis extensions are trusted local code. Like pi extensions, they are installed intentionally and run with the permissions of the local app.

An extension can contribute:

- panes
- pi tools
- typed channels
- file watchers
- commands
- status or palette entries
- documentation
- examples

Each extension receives an activation context and a lifetime bag. Anything it registers goes into that bag. Deactivation disposes the bag.

```ts
export interface TrellisExtension {
  id: string;
  trellisApi: string;
  activate(ctx: TrellisExtensionContext): void | Promise<void>;
}
```

`trellisApi` declares which substrate version the extension targets (e.g. `"^0.1.0"`). The cockpit refuses to load extensions whose declared range doesn't include the current substrate version. This lets the substrate evolve without breaking older extensions, in the same way VS Code uses `engines.vscode`.

The exact manifest shape will evolve, but the invariant is stable: extensions register contributions through a small context object instead of reaching into cockpit internals.

## Pane types

Trellis supports three pane contribution shapes.

### React pane

The default for first-party or trusted extension UI. The extension contributes a React component. Trellis renders it in the cockpit React tree and wraps it in an error boundary.

Use for:

- conversation panes
- settings panes
- status-heavy UI
- panes that should share Trellis design tokens and keyboard behavior

Tradeoff: React panes are fast and ergonomic, but share the renderer process. A broken pane can still cause performance issues even if render errors are caught.

### Iframe pane

The escape hatch for content Trellis should not own directly. The extension contributes HTML or a URL. Trellis renders it in an iframe and wires the same typed channel over `postMessage`.

Use for:

- agent-generated reports
- arbitrary HTML dashboards
- third-party embeds
- non-React frameworks such as Svelte, Vue, Solid, or vanilla HTML
- content that benefits from CSS/style isolation

Iframe panes are not the only first-class pane type, but they are the natural home for generated or framework-independent content.

### Declarative contribution

For small UI surfaces where Trellis should own the rendering. The extension contributes data, not a component.

Use for:

- status bar items
- command palette entries
- menus
- simple tree/list items

This follows the VS Code pattern: use declarative contributions when the host can render a consistent UI; use custom panes only when the extension needs to own the surface.

## Channels

Panes communicate through typed channels.

A channel message is validated at runtime with TypeBox. TypeBox is used because pi already uses TypeBox for tool schemas, and TypeBox schemas are JSON Schema-compatible.

Channel events have modes:

- `local` — stays within the extension/frontend
- `silent` — updates state or context but does not trigger an agent turn
- `turn` — triggers an agent turn

This allows token-efficient interaction. A report pane can send small structured state changes as the human edits fields, then trigger the agent only when the user asks for a response.

Example message shape:

```ts
const FieldChanged = Type.Object({
  kind: Type.Literal("field_changed"),
  path: Type.String(),
  value: Type.Unknown(),
});
```

For high-frequency UI, extensions should send scoped diffs rather than whole documents.

## State model

State persistence has three patterns. Choose by lifecycle, not by default.

### Custom session entries (default for per-turn state)

Pi's session is an append-only timeline of turns plus arbitrary custom entries. Extensions attach structured data to a turn via `session.appendCustomEntry({ type, ... })`.

This is the default because it gives you:

- **Branching and navigation for free.** Pi's tree is the timeline; navigating back removes "future" entries from scope.
- **Fork-aware state.** Fork a session, entries fork with it.
- **No separate storage.** Pi already persists the session file.
- **Natural lifetime.** Entries live with the session; session deleted, entries gone.

Use for: which pane was focused, which canvas was current, what document was open, any per-turn snapshot reference.

### Files on disk

Appropriate when state has its own lifecycle outside the session.

Use for:

- knowledge bases spanning sessions
- user-editable artifacts (CSS, markdown, code)
- cross-extension shared state
- content too large to fit in entries

Pattern: extensions define their own on-disk schemas under a project directory (e.g. `knowledge/`, `dashboards/`, `.trellis/<extension-id>/`). Panes render from those files. The cockpit watches relevant files and notifies panes.

### Hybrid: entry references file

A custom session entry carries a small reference (`{ canvas: "main", contentHash: "abc..." }`); the content lives at a content-addressed path. Pi's tree drives versioning; files are deduped storage.

Use for per-turn-but-large content: generated HTML reports, rendered images, anything where the entry is metadata and the file is bytes. See `docs/archive/v0-canvas-protocol.md` for the canonical worked example (canvas snapshots).

Most non-trivial extensions use a mix of all three.

## Agent integration

Trellis owns the pi `AgentSession` for the cockpit. Extensions can contribute pi tools to that session.

Agent integration is opt-in. A Trellis extension can be a pure local UI extension with no agent tools, or it can expose a rich agent-facing API.

The important boundary:

- pi tools let the agent act
- Trellis panes let the human see and manipulate state
- channels connect pane events to extension logic and, when appropriate, to agent turns

A generated report does not require the agent to code everything from scratch. Extensions can provide templates, design-system primitives, and registered object types. The agent can call higher-level tools that create structured objects, and panes render those objects.

## Documentation and self-modification

Trellis follows pi's documentation pattern.

Pi does not preload all docs into context. The system prompt contains a small documentation map with absolute paths and topic routing. When the user asks about pi, the agent reads the relevant docs with the `read` tool and follows markdown cross-references.

Trellis does the same. **No markdown is in the agent's context until the agent reads it.** Only the small orientation block and the topic→path map are pinned in the system prompt.

A preloaded `trellis-core` pi extension appends an orientation block to the agent system prompt:

```text
You are operating inside the Trellis cockpit, an Electron app that hosts a pi
agent session and exposes structured UI surfaces to the user.

pi is the backend agent framework: sessions, tools, prompts, skills,
extensions, providers, and agent events.

Trellis is the frontend/UI substrate: panes, channels, contribution points,
file watching, and the bridge between agent tool calls and cockpit UI.

When working on pi topics, read pi docs. When working on Trellis topics, read
Trellis docs and follow markdown cross-references before implementing.
```

It also appends a Trellis documentation map:

```text
Trellis documentation:
- Main documentation: <repo>/TRELLIS.md
- Additional docs: <repo>/docs
- Examples: <repo>/examples
- Extensions: docs/extensions.md
- Panes: docs/panes.md
- Channels: docs/channels.md
- Agent integration: docs/agent.md
- Contributions: docs/contributions.md
- Lifetimes: docs/lifetimes.md
```

The docs are plain markdown. They should be small, cross-linked, and written so the agent can traverse them with `read` when asked to modify Trellis or a Trellis extension.

Skills are not the primary self-modification documentation mechanism. Skills are for adding capabilities. Docs are for explaining the architecture.

## Lifetime model

Trellis uses named lifetime scopes.

A `DisposableBag` owns cleanup-requiring registrations. Every listener, IPC handler, watcher, subscription, or child resource goes into a bag. Disposing the bag tears down the subtree.

Common bags:

- `appBag` — app lifetime
- `extensionBag` — one extension activation
- `windowBag` — one BrowserWindow lifetime
- `sessionBag` — one agent session or project lifetime

This keeps registration and cleanup paired by construction.

## Near-term milestones

Completed:

- Electron + React cockpit shell
- typed IPC scaffold
- pi `createAgentSession` driver
- lifetime-scoped disposables

Next:

1. Extension loader
   - discover Trellis extensions
   - activate/deactivate with a lifetime bag
   - hot reload = dispose the bag + re-activate (sub-second, no cockpit restart). This is the test that lifetime boundaries are right.

2. Pane host and slot registry
   - slots in the renderer shell
   - React pane support with error boundaries
   - iframe pane support with `postMessage` channel
   - basic declarative contribution shape

3. Typed channel substrate
   - TypeBox schemas
   - runtime validation
   - local/silent/turn event modes
   - in-process and iframe transports (one API, two transports)

4. `trellis-core` pi extension
   - append system-prompt orientation
   - append Trellis doc map
   - register smoke-test cockpit tools
   - lives under `src/pi-package/extensions/trellis-core/` with its own `package.json` declaring `pi.extensions`

5. Agent tool contribution
   - extensions declare pi tools
   - cockpit contributes them to the active pi session
   - channel `turn` events can trigger prompts
   - channel `silent` events can update context/state

6. File watcher service
   - extension-owned glob watchers
   - disposable registrations
   - file events routed through channels

7. Default conversation extension
   - port current conversation pane into extension model
   - load by default
   - allow disabling

8. Docs and examples
   - `docs/extensions.md`
   - `docs/panes.md`
   - `docs/channels.md`
   - `docs/agent.md`
   - `docs/contributions.md`
   - `docs/lifetimes.md`
   - `examples/extensions/`

## Non-goals for v0

- marketplace distribution
- hostile-extension sandboxing
- web-only deployment
- template/database persistence system
- Lace port
- full design-system/report extension
- complex multi-agent orchestration
- default chrome only — no design system, markdown rendering, syntax highlighting, or code editor live in the cockpit; those are extension territory

Those can be built later on top of the substrate.
