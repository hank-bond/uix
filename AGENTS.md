# UIX

UIX is a local Electron cockpit for building bidirectional human-agent surfaces on top of pi.

Pi is the agent framework: sessions, tools, prompts, skills, extensions, model providers, and agent events. UIX is the UI substrate: panes, channels, contribution points, and the bridge between agent tool calls and frontend state.

The goal is not to build one fixed app. The goal is to provide the wiring primitives needed to build many local agent-facing apps: reports, dashboards, knowledge tools, design-system-backed deliverables, and interactive canvases.

## Core idea

The atomic UIX unit is a pane.

A pane is:

1. a render surface, and
2. a typed event channel.

The render surface lets an extension show UI to the human. The channel lets that UI communicate with other panes, with extension state, and optionally with the pi agent.

Everything else is layered on top.

## Layers

```text
pi
  agent sessions, tools, prompts, skills, extensions, model providers

UIX main process
  extension loading, lifetimes, agent session ownership, file watching

UIX renderer shell
  slots, pane host, chrome, layout, channel routing

UIX extensions
  panes, tools, declarative contributions, state schemas, docs

Pane content
  React components, iframe-rendered HTML, or declarative UI rendered by UIX
```

Pi and UIX are separate systems. A UIX-loadable package may contribute to either or both:

```json
{
  "name": "my-package",
  "pi": {
    "extensions": ["./pi/index.ts"],
    "skills": ["./pi/skills"]
  },
  "uix": {
    "extension": "./uix/manifest.ts"
  }
}
```

Both `pi` and `uix` are optional. A package can be pi-only (wrapping an existing pi extension so it gets discovered through UIX), uix-only (pure cockpit UI), or both.

The `pi` field teaches the agent new backend capabilities. The `uix` field teaches the cockpit new frontend capabilities.

## Substrate primitives

The cockpit provides exactly these primitives. Anything not in this list is an extension responsibility.

| Primitive                     | Purpose                                                                        |
| ----------------------------- | ------------------------------------------------------------------------------ |
| **Extension loader**          | Discover, load, activate, hot-reload extensions.                               |
| **Pane host + slot registry** | Mount React, iframe, or declarative render surfaces into named slots.          |
| **Typed channel**             | Bidirectional bus carrying validated events between panes and the agent.       |
| **Lifetime bags**             | Per-extension `DisposableBag`. Disposes everything an extension registered.    |
| **Agent session manager**     | Owns the pi session, collects tool contributions, routes channel events to pi. |
| **File watcher service**      | Cockpit-owned watcher; extensions register glob → callback.                    |

The cockpit shell (window, slot layout, error boundaries) sits underneath these primitives but is not itself extensible.

## Extension model

UIX extensions are trusted local code. Like pi extensions, they are installed intentionally and run with the permissions of the local app.

An extension can contribute:

- panes
- pi tools
- typed channels
- file watchers
- commands
- status or palette entries
- documentation
- examples

UIX currently discovers packages from `.uix/extensions/*` (project-local,
rooted at the cockpit process cwd) and `~/.uix/extensions/*` (user/global).
Entries listed in `package.json` under `uix.extensions` are loaded with
[jiti](https://github.com/unjs/jiti), so extension authors can edit `.ts` files
and trigger reload without rebuilding the Electron app. `@uix/api` is type-only
for now; extensions should use `import type`.

Each extension receives an activation context and a lifetime bag. Anything it registers goes into that bag. Deactivation disposes the bag. Cockpit reload re-runs discovery, clears the reusable `extensionsBag`, and re-activates all UIX extensions. It also delegates to pi's `session.reload()` when a pi session already exists, so the user-facing reload action is cockpit-level even though the UIX and pi reload mechanisms stay separate internally.

```ts
import type { ExtensionAPI } from "@uix/api";

export default function (uix: ExtensionAPI) {
  uix.registerPane({
    /* ... */
  });
  uix.registerChannel({
    /* ... */
  });
}
```

This mirrors pi's extension shape exactly — a default-exported factory function that receives an injected API object. Pi extensions look the same:

```ts
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export default function (pi: ExtensionAPI) {
  pi.registerTool(helloTool);
}
```

The shared shape is intentional. A developer (or LLM) writing both pi and UIX extensions sees one pattern: import a type, export a factory, register contributions through the injected API. The `ExtensionAPI` symbol is disambiguated by its import source.

The package's `id` comes from `package.json` (the `name` field), so the loader can identify a package before loading any of its code. Factories may be `async`.

The exact API shape will evolve, but the invariant is stable: extensions register contributions through the injected API object instead of reaching into cockpit internals. **All extension ↔ cockpit traffic flows through the API object** — extensions never import cockpit internals. This is what makes a future move to worker-thread or utility-process isolation a mechanical swap rather than an API break.

_Version gating_ (refusing to load extensions targeting an incompatible substrate version, like VS Code's `engines.vscode`) is deliberately not done in v0. Pre-1.0 with one author, the gate would mostly be noise. We can add it later, in package.json, when external extensions become a real scenario.

## Pane types

UIX supports three pane contribution shapes.

### React pane

The default for first-party or trusted extension UI. The extension contributes a React component. UIX renders it in the cockpit React tree and wraps it in an error boundary.

Use for:

- conversation panes
- settings panes
- status-heavy UI
- panes that should share UIX design tokens and keyboard behavior

Tradeoff: React panes are fast and ergonomic, but share the renderer process. A broken pane can still cause performance issues even if render errors are caught.

### Iframe pane

The escape hatch for content UIX should not own directly. The extension contributes HTML or a URL. UIX renders it in an iframe and wires the same typed channel over `postMessage`.

Use for:

- agent-generated reports
- arbitrary HTML dashboards
- third-party embeds
- non-React frameworks such as Svelte, Vue, Solid, or vanilla HTML
- content that benefits from CSS/style isolation

Iframe panes are not the only first-class pane type, but they are the natural home for generated or framework-independent content.

### Declarative contribution

For small UI surfaces where UIX should own the rendering. The extension contributes data, not a component.

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

Pattern: extensions define their own on-disk schemas under a project directory (e.g. `knowledge/`, `dashboards/`, `.uix/<extension-id>/`). Panes render from those files. The cockpit watches relevant files and notifies panes.

### Hybrid: entry references file

A custom session entry carries a small reference (`{ canvas: "main", contentHash: "abc..." }`); the content lives at a content-addressed path. Pi's tree drives versioning; files are deduped storage.

Use for per-turn-but-large content: generated HTML reports, rendered images, anything where the entry is metadata and the file is bytes. See [`docs/archive/v0-canvas-protocol.md`](./docs/archive/v0-canvas-protocol.md) for the canonical worked example (canvas snapshots).

Most non-trivial extensions use a mix of all three.

## Agent integration

UIX owns the pi `AgentSession` for the cockpit. Extensions can contribute pi tools to that session.

Agent integration is opt-in. A UIX extension can be a pure local UI extension with no agent tools, or it can expose a rich agent-facing API.

The important boundary:

- pi tools let the agent act
- UIX panes let the human see and manipulate state
- channels connect pane events to extension logic and, when appropriate, to agent turns

A generated report does not require the agent to code everything from scratch. Extensions can provide templates, design-system primitives, and registered object types. The agent can call higher-level tools that create structured objects, and panes render those objects.

## Documentation and self-modification

UIX follows pi's documentation pattern.

Pi does not preload all docs into context. The system prompt contains a small documentation map with absolute paths and topic routing. When the user asks about pi, the agent reads the relevant docs with the `read` tool and follows markdown cross-references.

UIX does the same. **No markdown is in the agent's context until the agent reads it.** Only the small orientation block and the topic→path map are pinned in the system prompt.

The cockpit applies a baseline configuration to its UIX-owned agent — an orientation block, a UIX documentation map, and a small set of cockpit-aware tools. This is implemented through **core agent bindings** (internal code under `src/main/agent/`, with feature-owned bindings such as `src/main/canvas/agent-binding.ts`), **not** a UIX extension. The user can't uninstall it; it's part of how the cockpit talks to the agent at all.

The orientation block appended to the system prompt:

```text
You are operating inside the UIX cockpit, an Electron app that hosts a pi
agent session and exposes structured UI surfaces to the user.

pi is the backend agent framework: sessions, tools, prompts, skills,
extensions, providers, and agent events.

UIX is the frontend/UI substrate: panes, channels, contribution points,
file watching, and the bridge between agent tool calls and cockpit UI.

When working on pi topics, read pi docs. When working on UIX topics, read
UIX docs and follow markdown cross-references before implementing.
```

It also appends a UIX documentation map:

```text
UIX documentation:
- Main documentation: <repo>/AGENTS.md
- Additional docs: <repo>/src/docs
- Examples: <repo>/examples
- Extensions: src/docs/extensions.md
- Panes: src/docs/panes.md
- Channels: src/docs/channels.md
- Agent integration: src/docs/agent.md
- Contributions: src/docs/contributions.md
- Lifetimes: src/docs/lifetimes.md
```

`src/docs/` holds the user-facing documentation that ships with the substrate
— what the code is and how to use it. The repo-root `/docs/` directory holds
dev-facing documentation (architecture state, open questions, archived
thinking) and is not pinned in the agent's system prompt.

The docs are plain markdown. They should be small, cross-linked, and written so the agent can traverse them with `read` when asked to modify UIX or a UIX extension.

Skills are not the primary self-modification documentation mechanism. Skills are for adding capabilities. Docs are for explaining the architecture.

## Lifetime model

UIX uses named lifetime scopes.

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
- Extension loader
  - discover UIX extensions from project/user roots
  - activate/deactivate with lifetime bags
  - jiti-backed TypeScript extension loading
  - cockpit reload = clear the extension subtree + re-activate without restarting Electron; also reload pi resources if a pi session already exists
- Raw HTML canvas Stage 1
  - key-addressed local canvas store (`.uix/canvas/<key>.html` as adapter detail)
  - own-origin `uix-canvas://` protocol, never `srcdoc`
  - core agent binding with `uix_canvas_read` / `uix_canvas_write`
  - hardcoded `<Canvas canvasKey="main" />` with whole-document iframe refresh on `canvasChanged`

Next:

1. Pane host and slot registry
   - slots in the renderer shell
   - general registered iframe pane support (the hardcoded canvas proves the protocol/render path first)
   - iframe `postMessage` channel bridge after mounting works
   - React pane support for first-party/trusted panes later
   - basic declarative contribution shape

2. Typed channel substrate
   - TypeBox schemas
   - runtime validation
   - local/silent/turn event modes
   - in-process and iframe transports (one API, two transports)

3. Core agent bindings
   - cockpit applies baseline agent configuration (orientation block, UIX doc map, smoke-test cockpit tools)
   - lives in the cockpit's own source (`src/main/agent/` plus feature-owned bindings); not an installable UIX extension
   - rationale: the orientation/doc map/cockpit tools are how the cockpit talks to the agent at all; modelling them as an extension was a category mistake (extensions are user-installed, this is core)

4. Agent tool contribution
   - extensions declare pi tools
   - cockpit contributes them to the active pi session
   - channel `turn` events can trigger prompts
   - channel `silent` events can update context/state

5. File watcher service
   - extension-owned glob watchers
   - disposable registrations
   - file events routed through channels

6. Default conversation extension
   - port current conversation pane into extension model
   - load by default
   - allow disabling

7. Docs and examples
   - `src/docs/extensions.md`
   - `src/docs/panes.md`
   - `src/docs/channels.md`
   - `src/docs/agent.md`
   - `src/docs/contributions.md`
   - `src/docs/lifetimes.md`
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
