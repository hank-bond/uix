---
summary: "Architecture record for the implemented UIX shell, feature runtime, workspace renderer, state services, agent integration, and first-party features."
kind: reference
---

# Current state

This document records the implemented system at HEAD. The root [`AGENTS.md`](../../AGENTS.md) states the project model. The user-implementation guides live under [`AGENTS.md`](../../src/docs/AGENTS.md).

## Application shell and workspaces

Electron boots one workspace per application instance. `UIX_WORKSPACE` can name a manifest or workspace directory. Development also opens a manifest in the current working directory.

Without either target, the launcher opens recent manifests or scaffolds a workspace. Bare scaffolding copies editable passthrough Pi tools and writes an explicit manifest.

`resolveWorkspace()` derives the state root, agent working directory, and manifest path from the workspace directory. Session and document state live under that root.

## Feature runtime

The ordered `features` array in `uix.workspace.json` is the complete composition record. Each entry points directly to a TypeScript or JavaScript module that exports `feature`.

The main-process loader evaluates entries with Jiti and aliases the blessed `@uix/api` and TypeBox modules. Feature code remains trusted local code, not sandboxed code.

Activation hydrates provisional feature settings before running `context()` and `contribute()`. It then registers resources, channels, agent tools, prompt sections, skills, turn state, agent context, and surfaces.

Each activation owns one provisional `DisposableBag`. A failed feature loses every acquired setting or facet capability, while sibling activation continues. A successful feature joins the active composition.

Manifest and workspace-setting candidates validate before replacing the live generation. A malformed reload preserves the active composition. A malformed startup candidate logs an error and opens without features.

Reload commits settled feature turn state from every live agent instance before replacing the feature composition. It then reloads initialized Pi resources and restores each live instance's branch state. Surface publication follows restoration. Requests serialize through `WorkspaceReloadCoordinator`.

## Channels and resources

A shared `ChannelContract` defines request, response, and event schemas. Backend code adds handlers with `withHandlers()` and obtains contract-bound event publishers through the injected feature context.

Each workspace runtime owns one `ChannelRegistry` that resolves owner-scoped ids and validates requests and responses. A runtime-created attachment prepares each canonical request with immutable guarded context and the registry entry's log policy. The Electron host records the physical crossing and invokes that prepared dispatch. Workspace clients derive typed request and event methods, and event clients validate incoming payloads.

Electron Inter-Process Communication (IPC) is the implemented physical channel transport. Runtime events have workspace or session scope. Only matching attachments receive them. Canvas iframe writeback still uses a feature-owned `postMessage` shim before entering typed channels. A general iframe channel adapter does not exist.

The `uix-resource://` protocol dispatches normalized feature resource routes. Surface bundles and files use a reserved substrate origin. Canvas documents use a feature-isolated resource origin.

## Surface and workspace runtime

The renderer owns one workspace page. It requests the live surface list, dynamically imports each content-hash-busted bundle, and mounts each surface behind an error boundary.

Esbuild bundles surface entry modules on demand. Virtual shared modules preserve the page's React, TypeBox, and `@uix/api` instances. CSS module scripts remain external and retain explicit cascade order.

The mount path adopts each surface stylesheet inside a structural `@scope`. Name-global CSS declarations still require feature-prefixed names.

The workspace renderer also owns actions, keybinding synchronization, and the active attachment-target session projection. Feature surfaces register action trees through scoped React context. Consumers receive a serializable flat catalog and id-based invocation.

Main persists portable keybindings under `settings.keybindings`. The renderer resolves platform gestures, identifies conflicts, and dispatches only confirmed unique bindings. A default command-palette feature has not landed.

## Settings and durable state

`WorkspaceManifestStore` stages, promotes, and atomically flushes manifest generations. Disk remains authoritative across reload. Debounced writes reject stale generation locations.

`SettingsRegistry` owns live complete scopes. Feature definitions declare one TypeBox object or record schema plus an optional whole-object default. Defaults materialize into persisted state instead of remaining live overlays.

The substrate registers `agent` and `keybindings` workspace namespaces. Features receive only their bound `ctx.settings` handle. Surfaces receive a feature-bound settings client.

`DocumentStore` persists current document bytes and immutable versions under stable ids. `CanvasDocumentBuffer` adds Canvas normalization and anchored working projections without becoming durable authority.

Turn-state contributions define named schema-bound cells. Each agent instance owns a coordinator for its session viewpoint. It restores branch values before the instance is admitted, commits changed complete snapshots at run boundaries and teardown, and participates in guarded workspace reload. Contribution callbacks and feature buffers remain workspace-scoped. The runtime has no per-instance instantiation boundary for them.

Agent-context contributions materialize hidden model-visible sections. One assembler combines active sections into a `uix.state` message and provides a generated vocabulary section to the system prompt.

UIX exposes no public arbitrary filesystem watcher. External manifest changes take effect through reload.

## Agent runtime

Each workspace runtime owns one `WorkspaceAgentRuntime`. Its `AgentInstanceSupervisor` maps session ids to guarded primary agent instances with single-flight creation and immediate zero-guard teardown policy. Each instance owns an independent Pi `SessionManager`, branch-restored state, and at most one lazily booted `AgentSessionRuntime`. History and session summaries remain available before Pi execution starts.

Attachments hold replaceable target guards. Prepared requests, running turns, reload, and teardown-sensitive work hold independent guards for their complete asynchronous use. Several attachments to one session share its instance, while different sessions remain independently supervised.

UIX stores sessions under the workspace state root. One application-owned Pi app data directory under Electron `userData` provides credentials, settings, models, and extension resources across workspaces.

Each instance creates Pi with built-in tools inactive. Manifest features therefore define the complete UIX-selected tool surface. Internal installers adapt live agent-facet registries into Pi.

The substrate agent contract handles prompts, history, recent summaries, attachment retargeting, titles, model selection, favorites, provider authentication, and session-scoped live events. Chat consumes that contract as an ordinary feature.

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
- [`electron-server-split.md`](../../plans/electron-server-split.md) splits UIX into hosts, a workspace supervisor, one-workspace runtimes, and a shared browser client.
- [`canvas-reusable-assets.md`](../../plans/canvas-reusable-assets.md) gives Canvas a reusable local web-asset library in eight reviewable units.
- [`cross-feature-capabilities-and-resource-viewing.md`](../../plans/cross-feature-capabilities-and-resource-viewing.md) establishes publisher-qualified public protocols, document resources, and resource viewers after identity and selection details settle.
- [`framework-neutral-surfaces-and-shell.md`](../../plans/framework-neutral-surfaces-and-shell.md) moves frontend frameworks into feature ownership in post-alpha stages.
- [`persistence-and-session-foundation.md`](../../plans/persistence-and-session-foundation.md) specifies the file-backed session and branch-restoration foundation. C0/C1 have landed and C2–C5 remain deferred.
- [`workspace-first-render-gate.md`](../../plans/workspace-first-render-gate.md) shows a substrate-owned loading overlay until the initial composition restores and renders.

The complete build map lives in [`AGENTS.md`](../../plans/AGENTS.md). Unresolved architecture questions live in [`open-questions.md`](./open-questions.md).
