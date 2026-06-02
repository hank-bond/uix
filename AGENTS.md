# UIX

UIX is a local Electron cockpit for building bidirectional human-agent surfaces on top of pi. Pi is the agent framework (sessions, tools, prompts, skills, extensions, model providers, agent events); UIX is the UI substrate (panes, channels, contribution points, and the bridge between agent tool calls and frontend state). The goal is not one fixed app but the wiring to build many local agent-facing apps: reports, dashboards, knowledge tools, design-system deliverables, interactive canvases.

This file is the always-loaded orientation — the core model, the load-bearing invariants, and a routing map. Everything else lives one level down and is read on demand; nothing below this file is pinned into the agent's context.

## Core idea

The atomic UIX unit is a **pane**: a render surface plus a typed event channel. The surface shows UI to the human; the channel lets it talk to other panes, to extension state, and optionally to the pi agent. Everything else layers on top.

## Layers

```text
pi                  agent sessions, tools, prompts, skills, providers, events
UIX main            extension loading, lifetimes, agent session ownership, file watching
UIX renderer shell  slots, pane host, chrome, layout, channel routing
UIX extensions      panes, tools, declarative contributions, state schemas, docs
pane content        React, iframe HTML, or declarative UI rendered by UIX
```

Pi and UIX are separate systems. A loadable package may contribute to either or both via optional `pi` and `uix` fields in `package.json`: the `pi` field teaches the agent backend capabilities, the `uix` field teaches the cockpit frontend capabilities.

## Substrate primitives

The cockpit provides exactly these; anything else is an extension responsibility.

| Primitive | Purpose |
| --- | --- |
| **Extension loader** | Discover, load, activate, hot-reload extensions. |
| **Pane host + slot registry** | Mount React, iframe, or declarative surfaces into named slots. |
| **Typed channel** | Bidirectional bus carrying validated events between panes and the agent. |
| **Lifetime bags** | Per-extension `DisposableBag`; disposes everything an extension registered. |
| **Agent session manager** | Owns the pi session, collects tool contributions, routes channel events to pi. |
| **File watcher service** | Cockpit-owned watcher; extensions register glob → callback. |

The cockpit shell (window, slot layout, error boundaries) sits underneath these and is not itself extensible.

## Invariants

The rules that constrain every change — hold these before reaching for detail:

- **Pilot, not the pilot's brain.** UIX adds capabilities for the _human working with the agent_, not for the agent; anything that makes the agent smarter belongs in pi. → [decision](docs/decisions/2026-05-30-uix-is-a-pilot-substrate.md)
- **Extensions never import cockpit internals.** All extension ↔ cockpit traffic flows through the injected `@uix/api` object, which keeps a future worker/utility-process isolation a mechanical swap. → [decision](docs/decisions/2026-05-30-extension-activation-and-isolation.md)
- **The agent edits files, not the UI.** Persistent artifacts change through ordinary file-edit tools; channels carry validated events, not an agent-side UI API. → [decision](docs/decisions/2026-05-30-no-agent-ui-manipulation.md)
- **Hosting-compatible by default.** The filesystem is never load-bearing — it's one local impl of a content store + change feed; address by id, cockpit is sole writer, content-hash echo suppression, field-level merge. → [decision](docs/decisions/2026-05-31-hosting-compatible-by-default.md)
- **One channel API, two transports.** In-process and iframe `postMessage` sit behind one channel API (hosting later adds a third).
- **Docs are read on demand.** Nothing below this file is preloaded; route via the map below and follow links.

## Where to read

- **Building on UIX** — extensions, panes, channels, agent integration, state, lifetimes → [`src/docs/`](src/docs/AGENTS.md), the user-facing substrate reference.
- **Why things are the way they are** — decisions, design threads, architecture state, plans → [`docs/`](docs/AGENTS.md), the dev-facing meta docs.
- **Examples** → `examples/`.

The cockpit injects this same orientation plus the doc map into its UIX-owned agent through core agent bindings (`src/main/agent/`) — not an extension; it's how the cockpit talks to the agent at all. Skills add capabilities; docs explain the architecture.

## Non-goals

UIX is not a marketplace, a sandbox for hostile extensions, a web-only deployment, a template/database persistence system, or a multi-agent orchestrator. The cockpit ships default chrome only — design system, markdown rendering, syntax highlighting, and a code editor are extension territory. All of these can be built on top of the substrate later.
