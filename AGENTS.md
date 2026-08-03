---
summary: "Project orientation for UIX, its substrate model, invariants, layers, and documentation routing."
read_when: "Read first when entering the repo or deciding whether a change belongs in UIX or Pi."
status: active
---

# UIX

UIX is a local Electron cockpit for building bidirectional human-agent surfaces on Pi. Pi supplies sessions, tools, prompts, skills, providers, extensions, and agent events. UIX supplies surfaces, channels, feature facets, and the bridge between agent activity and frontend state.

The project provides wiring for many local agent-facing applications, not one fixed application. Examples include reports, dashboards, knowledge tools, design-system deliverables, and interactive canvases.

This file is the always-loaded orientation and routing map. Read lower documentation nodes only when their summaries match the task.

## Work with the documentation graph

The repository documentation is a graph, not a corpus to read up front. Start at this file and descend through each directory's `AGENTS.md` index.

Each node has a one-line _summary_ that states its thesis. A node adds _read_when_ only when the summary does not reveal its retrieval trigger.

Traverse the graph in both working modes:

- **When thinking:** Read the decisions, design threads, and open questions that constrain the choice before selecting an approach.
- **When doing:** Read the architecture record, shipped reference, and active plan that govern the change.

Follow these retrieval rules:

- Open only documents whose summary or trigger matches the task.
- Do not reload a document that is already in the context window.
- Follow inline cross-links because decisions, plans, and sibling threads often carry constraints outside the index.

The project uses on-demand traversal. Broad summary preloading remains a possible later optimization.

## Core model

A _feature_ is UIX's loadable unit. It can contribute resources, typed channels, agent facets, turn state, agent context, settings, and visible surfaces.

A _workspace_ is a directory defined by `uix.workspace.json`. Its ordered feature entry references are the complete composition; UIX performs no feature auto-discovery. One workspace page composes the active feature surfaces over one selected Pi session graph.

Channels connect surfaces to feature backends and substrate services. A feature can also publish a contract that another feature imports deliberately. Chat consumes the substrate agent contract through this same path.

Chat, Canvas, and the reference workspace tools are ordinary source-loaded features. Bare workspace scaffolding copies only editable passthrough Pi tool providers.

## Layers

```text
Pi                  agent sessions, tools, prompts, skills, providers, events
UIX main            feature loading, facet registries, state services, agent runtime
UIX workspace       surface composition, actions, session projection, channel clients
UIX features        surfaces, channels, resources, agent facets, settings, turn state
surface content     trusted React feature UI or contained authored iframe HTML
```

Pi and UIX have separate lifecycles. A package may contain both Pi extensions and UIX feature entries. Pi loads its extension resources, while the workspace manifest selects UIX entries.

## Substrate primitives

The cockpit provides these primitives. Product behavior above them belongs to features.

| Primitive | Purpose |
| --- | --- |
| **Feature runtime** | Load manifest entries, activate each feature atomically, and replace the active composition on reload. |
| **Facet registries** | Own live resources, channels, surfaces, agent facets, turn state, and agent context. |
| **Surface runtime** | Bundle, mount, style-scope, and isolate contributed surface modules. |
| **Typed channels** | Derive validated requests, responses, events, handlers, publishers, and clients from shared contracts. |
| **State services** | Own workspace settings, document persistence, and branch-scoped feature turn state. |
| **Agent runtime** | Own Pi services and sessions, install agent facets, project transcripts, and coordinate restoration. |
| **Workspace services** | Own renderer actions, keybindings, selected-session projection, and fixed shell behavior. |
| **Lifetime bags** | Dispose app, feature, window, and agent capabilities in deterministic order. |

The cockpit shell remains fixed infrastructure. Features provide opinionated surfaces such as Chat, Canvas, palettes, settings editors, and report viewers.

## Invariants

Apply these rules before reaching for subsystem details:

- **Pilot, not the pilot's brain:** UIX adds capabilities for the human working with the agent. Agent intelligence belongs in Pi. See [`2026-05-30-uix-is-a-pilot-substrate.md`](docs/decisions/2026-05-30-uix-is-a-pilot-substrate.md).
- **Mirror Pi's self-extension ethos:** Ship composable primitives and thin default chrome, not fixed product features. See [`2026-06-05-pi-self-extension-ethos.md`](docs/decisions/2026-06-05-pi-self-extension-ethos.md).
- **Features do not import cockpit internals:** Feature traffic uses the injected context and `@uix/api`. See [`2026-07-01-features-are-the-loadable-unit.md`](docs/decisions/2026-07-01-features-are-the-loadable-unit.md).
- **The agent changes artifacts, not live views:** Agent tools change authoritative feature data. Channels carry validated events instead of exposing UI handles. See [`2026-05-30-no-agent-ui-manipulation.md`](docs/decisions/2026-05-30-no-agent-ui-manipulation.md).
- **Hosting-compatible by default:** Address durable content by id behind owned stores. Do not expose local filesystem mechanics as feature contracts. See [`2026-05-31-hosting-compatible-by-default.md`](docs/decisions/2026-05-31-hosting-compatible-by-default.md).
- **One logical channel API:** The Electron transport implements the contract today. Future iframe or hosted adapters must preserve the same request and event model.
- **Documentation is on demand:** Route through the map below and load only the relevant leaves.

## Where to read

The `src/docs/` tree is the shipped substrate reference. The `docs/` tree contains architecture, decisions, design threads, and documentation practice. Root-level `plans/` tracks builds. The `website/` directory contains the public uix.sh marketing site.

<!-- INDEX:START -->

<!-- Generated from each doc's frontmatter by scripts/docs-index.mjs. Do not edit by hand; run `npm run docs:index`. -->

- **[src/docs/](./src/docs/AGENTS.md)** _(active)._ The shipped substrate reference covers features, surfaces, channels, agent integration, settings, state, and lifetimes in lockstep with code.
- **[docs/](./docs/AGENTS.md)** _(active)._ Dev-facing meta docs for current architecture, settled decisions, design threads, and documentation practice.
- **[plans/](./plans/AGENTS.md)** _(active)._ Active build specs, reviewable delivery units, and a backlog of smaller implementation seeds.
- **[website/](./website/AGENTS.md)** _(active)._ The zero-build uix.sh landing page uses static HTML, CSS, and JavaScript with a reduced-motion-safe brandmark morph. _Read when editing the landing page, brandmark animation, styles, or favicon._

<!-- INDEX:END -->

The cockpit injects this orientation and routing map through its owned agent integration. Skills add capabilities; documentation explains project architecture.

## Non-goals

UIX is not a marketplace, hostile-code sandbox, web-only deployment, or multi-agent orchestrator. Design systems, rendering libraries, editors, and opinionated workflows remain feature territory.
