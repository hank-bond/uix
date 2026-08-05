---
summary: "Architecture record for the implemented UIX shell, feature runtime, workspace renderer, state services, agent integration, and first-party features."
kind: reference
status: active
---

# Current state

This document records the implemented system at HEAD. The root [`AGENTS.md`](../../AGENTS.md) states the project model. The user-implementation guides live under [`AGENTS.md`](../../src/docs/AGENTS.md).

## Application shell and workspaces

Electron boots one workspace per application instance. `UIX_WORKSPACE` can name a manifest or workspace directory. Development also opens a manifest in the current working directory.

Without either target, the start picker opens recent manifests or scaffolds a workspace. Bare scaffolding copies editable passthrough Pi tools and writes an explicit manifest.

`resolveWorkspace()` derives the state root, agent working directory, and manifest path from the workspace directory. Session and document state live under that root.

## Feature runtime

The ordered `features` array in `uix.workspace.json` is the complete composition record. Each entry points directly to a TypeScript or JavaScript module that exports `feature`.

The main-process loader evaluates entries with Jiti and aliases the blessed `@uix/api` and TypeBox modules. Feature code remains trusted local code, not sandboxed code.

Activation hydrates provisional feature settings before running `context()` and `contribute()`. It then registers resources, channels, agent tools, prompt sections, skills, turn state, agent context, and surfaces.

Each activation owns one provisional `DisposableBag`. A failed feature loses every acquired setting or facet capability, while sibling activation continues. A successful feature joins the active composition.

Manifest and workspace-setting candidates validate before replacing the live generation. A malformed reload preserves the active composition. A malformed startup candidate logs an error and opens without features.

Reload commits settled feature turn state, replaces the feature composition, reloads initialized Pi resources, and restores selected-branch state. Surface publication follows restoration. Requests serialize through `WorkspaceReloadCoordinator`.

## Channels and resources

A shared `ChannelContract` defines request, response, and event schemas. Backend code adds handlers with `withHandlers()` and obtains contract-bound event publishers through the injected feature context.

`ChannelRegistry` resolves owner-scoped ids and validates requests and responses at the main boundary. Workspace clients derive typed request and event methods. Event clients validate incoming event payloads.

Electron Inter-Process Communication (IPC) is the implemented channel transport. Canvas iframe writeback still uses a feature-owned `postMessage` shim before entering typed channels. A general iframe channel adapter does not exist.

The `uix-resource://` protocol dispatches normalized feature resource routes. Surface bundles and files use a reserved substrate origin. Canvas documents use a feature-isolated resource origin.

## Surface and workspace runtime

The renderer owns one workspace page. It requests the live surface list, dynamically imports each content-hash-busted bundle, and mounts each surface behind an error boundary.

Esbuild bundles surface entry modules on demand. Virtual shared modules preserve the page's React, TypeBox, and `@uix/api` instances. CSS module scripts remain external and retain explicit cascade order.

The mount path adopts each surface stylesheet inside a structural `@scope`. Name-global CSS declarations still require feature-prefixed names.

The workspace renderer also owns actions, keybinding synchronization, and selected-session projections. Feature surfaces register action trees through scoped React context. Consumers receive a serializable flat catalog and id-based invocation.

Main persists portable keybindings under `settings.keybindings`. The renderer resolves platform gestures, identifies conflicts, and dispatches only confirmed unique bindings. A default command-palette feature has not landed.

## Settings and durable state

`WorkspaceManifestStore` stages, promotes, and atomically flushes manifest generations. Disk remains authoritative across reload. Debounced writes reject stale generation locations.

`SettingsRegistry` owns live complete scopes. Feature definitions declare one TypeBox object or record schema plus an optional whole-object default. Defaults materialize into persisted state instead of remaining runtime overlays.

The substrate registers `agent`, `session`, and `keybindings` workspace namespaces. Features receive only their bound `ctx.settings` handle. Surfaces receive a feature-bound settings client.

`DocumentStore` persists current document bytes and immutable versions under stable ids. `CanvasDocumentBuffer` adds Canvas normalization and anchored working projections without becoming durable authority.

Turn-state contributions define named schema-bound cells. The coordinator commits changed complete snapshots at run boundaries and restores selected-branch values on startup, session replacement, and reload.

Agent-context contributions materialize hidden model-visible sections. One assembler combines active sections into a `uix.state` message and supplies a generated vocabulary section to the system prompt.

UIX exposes no public arbitrary filesystem watcher. External manifest changes take effect through reload.

## Agent runtime

The main process owns one Pi `SessionManager` and a lazy `AgentSessionRuntime`. History and session summaries remain available before a live agent session starts.

UIX stores sessions under the workspace state root. One application-owned Pi profile under Electron `userData` supplies credentials, settings, models, and extension resources across workspaces.

The driver creates Pi with built-in tools inactive. Manifest features therefore define the complete UIX-selected tool surface. Internal installers adapt live agent-facet registries into Pi.

The substrate agent contract handles prompts, history, recent summaries, session replacement, titles, model selection, favorites, provider authentication, and live events. Chat consumes that contract as an ordinary feature.

Pi's `ModelRuntime` remains authoritative for providers, models, and authentication interactions. UIX projects available models and provider-owned login methods without persisting credentials itself.

Main projects live and replayed Pi entries into one `TranscriptSnapshot` model. Streaming assistant text appends through partial events. Tool progress uses replacement snapshots. Completed items replace one row.

Tool transcript items retain their execution working directory. Main derives file locations for supported filesystem tools, so historical rows do not reinterpret paths against later state.

## First-party feature composition

The repository manifest composes these ordinary features:

- **Chat:** Provides the conversation surface, session and model controls, provider login, Markdown rendering, syntax highlighting, and specialized tool presentations.
- **Workspace tools:** Provides exact-name reason-bearing `read`, `write`, and `command` tools plus passthrough `edit`.
- **Canvas:** Provides contained HTML documents, anchored tools, writeback channels, document resources, turn state, agent context, prompt guidance, and an authoring skill.

None of these features is a compiled-in substrate default. Bare workspaces start with editable passthrough Pi tool source instead.

## Active build edges

The active plans track work that is not architecture yet:

- [`chat-rendering-polish.md`](../../plans/chat-rendering-polish.md) continues thinking rendering, thinking controls, performance, and final documentation.
- [`chat-provider-login.md`](../../plans/chat-provider-login.md) continues no-model onboarding and model-picker connection entry points.
- [`workspace-actions-and-command-palette.md`](../../plans/workspace-actions-and-command-palette.md) continues reload shortcuts, ambient surfaces, palette UI, and customization.
- [`session-history-and-switching.md`](../../plans/session-history-and-switching.md) retains defensive hardening and final verification.
- [`durable-transcript-identity.md`](../../plans/durable-transcript-identity.md) retains durable low-frequency block state.
- [`electron-server-split.md`](../../plans/electron-server-split.md) explores extracting host-neutral runtime boundaries.

The complete build map lives in [`AGENTS.md`](../../plans/AGENTS.md). Unresolved architecture questions live in [`open-questions.md`](./open-questions.md).
