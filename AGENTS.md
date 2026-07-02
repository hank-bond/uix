---
summary: "Project orientation for UIX, its substrate model, invariants, layers, and documentation routing."
read_when: "Read first when entering the repo or deciding whether a change belongs in UIX or pi."
status: active
---

# UIX

UIX is a local Electron cockpit for building bidirectional human-agent surfaces on top of pi. Pi is the agent framework (sessions, tools, prompts, skills, extensions, model providers, agent events); UIX is the UI substrate (surfaces, channels, contribution facets, and the bridge between agent tool calls and frontend state). The goal is not one fixed app but the wiring to build many local agent-facing apps: reports, dashboards, knowledge tools, design-system deliverables, interactive canvases.

This file is the always-loaded orientation — the core model, the load-bearing invariants, and a routing map. Everything else lives one level down and is read on demand; nothing below this file is pinned into the agent's context.

## Working with the documentation graph

The repository documentation is a **graph you traverse on demand**, not a corpus to read up front. The root [`AGENTS.md`](./AGENTS.md) is always in your context; everything else is reached by following links down from it.

Each node carries a one-line **summary** (what it establishes — its thesis) and, only when the trigger isn't obvious from that summary, a **read_when** (when to open it). Use these to decide what to open: descend only into what's relevant to the task in front of you.

**Traverse regularly, in both modes:**

- **When thinking** (planning, designing, weighing options) — pull in the decisions, design threads, and open questions that bound the choice _before_ committing to an approach.
- **When doing** (writing or changing code) — pull in the architecture record, the relevant `src/docs/` reference, and any plan or decision that constrains the change.

**Rules:**

- Start at the root `AGENTS.md` and follow its routing map down through the dir-level `AGENTS.md` indexes to the leaf docs.
- Open a doc when its summary (or `read_when`) matches your task; skip the rest.
- **Do not re-read what is already in your context window** — if a file's content is already loaded, use it in place.
- Follow inline cross-links between docs: sibling threads and the decisions/plans a doc spawned are linked in prose, not in the index.

For now this is pure on-demand traversal. Preloading the top ~100 summaries breadth-first (a project-wide bird's-eye map) is a later optimization, not yet in effect.

## Core idea

The atomic UIX unit is a **feature**: a loadable definition that contributes to substrate facets — visible **surfaces**, typed **channels**, agent tools, turn state, agent context, resources. A **workspace** (one page, one window) composes enabled feature surfaces over one agent session; on disk it is a directory defined by its `uix.workspace.json` manifest, whose ordered feature entry-file references are the composition — no auto-discovery. Channels let a surface talk to its feature's backend, to other features, and optionally to the pi agent. Chat and canvas are default features loaded from source like any manifest entry, not core app structure. Everything else layers on top.

## Layers

```text
pi                  agent sessions, tools, prompts, skills, providers, events
UIX main            feature loading, lifetimes, facet registries, agent session ownership
UIX workspace       surface composition, layout, typed channel clients
UIX features        surfaces, channels, agent tools, turn state, agent context, resources
surface content     React (trusted feature UI) or iframe HTML (contained/authored content)
```

Pi and UIX are separate systems. A loadable package may contribute to either or both via optional `pi` and `uix` fields in `package.json`: the `pi` field teaches the agent backend capabilities, the `uix` field teaches the cockpit frontend capabilities.

## Substrate primitives

The cockpit provides exactly these; anything else is a feature responsibility.

| Primitive | Purpose |
| --- | --- |
| **Feature loader** | Load, register, hot-reload the workspace manifest's features (bundled and workspace alike). |
| **Surface composition** | Mount contributed feature surfaces into the workspace layout. |
| **Typed channel** | Contract-derived requests and events, validated both directions, between surfaces, feature backends, and the agent. |
| **Lifetime bags** | Per-feature `DisposableBag`; disposes everything a feature registered. |
| **Agent session manager** | Owns the pi session, installs agent-facet contributions, routes channel events to pi. |
| **File watcher service** | Cockpit-owned watcher; features register glob → callback. |

The cockpit shell (window, workspace layout, error boundaries) sits underneath these and is not itself extensible.

## Invariants

The rules that constrain every change — hold these before reaching for detail:

- **Pilot, not the pilot's brain.** UIX adds capabilities for the _human working with the agent_, not for the agent; anything that makes the agent smarter belongs in pi. → [decision](docs/decisions/2026-05-30-uix-is-a-pilot-substrate.md)
- **Mirror pi's self-extension ethos for UI.** Pi ships the tools to customize itself and little else (no subagents, permissions, or MCP — you build those through its integration points). UIX does the same one layer up for visual UI: ship composable primitives and thin default chrome, not fixed features. When tempted to hardcode a UI feature, make it a primitive something registers or composes. → [decision](docs/decisions/2026-06-05-pi-self-extension-ethos.md)
- **Features never import cockpit internals.** All feature ↔ cockpit traffic flows through the injected context and the `@uix/api` types, which keeps a future worker/utility-process isolation a mechanical swap. → [decision](docs/decisions/2026-07-01-features-are-the-loadable-unit.md)
- **The agent edits files, not the UI.** Persistent artifacts change through ordinary file-edit tools; channels carry validated events, not an agent-side UI API. → [decision](docs/decisions/2026-05-30-no-agent-ui-manipulation.md)
- **Hosting-compatible by default.** The filesystem is never load-bearing — it's one local impl of a content store + change feed; address by id, cockpit is sole writer, content-hash echo suppression, field-level merge. → [decision](docs/decisions/2026-05-31-hosting-compatible-by-default.md)
- **One channel API, two transports.** In-process and iframe `postMessage` sit behind one channel API (hosting later adds a third).
- **Docs are read on demand.** Nothing below this file is preloaded; route via the map below and follow links.

## Where to read

Two doc trees — `src/docs/` is the user-facing substrate reference (building on UIX); `docs/` is the dev-facing meta tree (why things are the way they are). Runnable examples live in `examples/`, and `website/` is the public marketing site served at uix.sh.

<!-- INDEX:START -->

<!-- Generated from each doc's frontmatter by scripts/docs-index.mjs — do not edit by hand; run `npm run docs:index`. -->

- **[src/docs/](./src/docs/AGENTS.md)** _(active)_ — The shipped, user-facing substrate reference for building on UIX — panes, channels, agent, extensions, lifetimes, state — kept in lockstep with current code.
- **[docs/](./docs/AGENTS.md)** _(active)_ — Dev-facing meta docs — decisions, design threads, architecture records, and plans — and the map for routing into them.
- **[website/](./website/AGENTS.md)** _(active)_ — The public uix.sh marketing site — a zero-build static landing page (plain HTML/CSS/JS) whose centerpiece is a scroll-driven brandmark morph, with all motion gated behind prefers-reduced-motion. _Read when editing the public landing page at uix.sh — its markup, the scroll-driven logo animation/CSS, or the favicon._

<!-- INDEX:END -->

The cockpit injects this same orientation plus the doc map into its UIX-owned agent through core agent facets (`src/main/agent/`) — not an extension; it's how the cockpit talks to the agent at all. Skills add capabilities; docs explain the architecture.

## Non-goals

UIX is not a marketplace, a sandbox for hostile features, a web-only deployment, a template/database persistence system, or a multi-agent orchestrator. The cockpit ships default chrome only — design system, markdown rendering, syntax highlighting, and a code editor are feature territory. All of these can be built on top of the substrate later.
