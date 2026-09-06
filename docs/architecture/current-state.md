---
summary: "Architecture record for the implemented UIX shell, feature runtime, workspace renderer, state services, agent integration, and first-party features."
kind: reference
---

# Current state

This document records the implemented system at HEAD. The root [`AGENTS.md`](../../AGENTS.md) states the project model. The user-implementation guides live under [`AGENTS.md`](../../src/docs/AGENTS.md).

## Application shell and workspaces

The discrete Electron host under `hosts/electron` boots one workspace per application instance. `UIX_WORKSPACE` can name a manifest or workspace directory. Development also opens a manifest in the current working directory. Each workspace window owns one supervisor-issued workspace guard and attachment, bound to its `webContents` identity.

Without either target, the launcher opens recent manifests or scaffolds a workspace. Bare scaffolding copies editable passthrough Pi tools and writes an explicit manifest.

The server host starts with zero active workspace runtimes and a boot-loaded read-only registry. Its default loopback profile derives a local public origin. Non-loopback binding requires either an explicit trusted-encrypted-network plaintext profile or a browser-visible TLS profile with an explicit public origin. Every HTTP and WebSocket request must use that configured public authority, and every supplied browser origin must match it. Canonical catalog locations, live CSP, content URLs, and cross-origin grants derive from the same policy without forwarding-header inference.

`resolveWorkspace()` derives the state root, agent working directory, and manifest path from the workspace directory. Session and document state live under that root.

## Feature runtime

The ordered `features` array in `uix.workspace.json` is the complete composition record. Each entry points directly to a TypeScript or JavaScript module that exports `feature`.

The main-process loader evaluates entries with Jiti and aliases the blessed `@uix/api` and TypeBox modules. Feature code remains trusted local code, not sandboxed code.

Activation hydrates provisional feature settings before running `workspace(ctx)`. Workspace contributions include resources, Workspace channel handlers, Agent channel contracts, viewpoint web route contracts, and surfaces. The loader retains `agent(ctx)` in manifest order.

Each Workspace activation owns one async-disposable feature bag. Each `AgentInstance` calls the retained Agent factories with fresh contexts. Its own bag holds their tools, channel and web route handlers, prompt sections, skills, turn state, and model context. A failed Workspace or Agent factory loses its partial work, while sibling features continue.

Manifest and workspace-setting candidates validate before replacing the live generation. A malformed reload preserves the active composition. A malformed startup candidate logs an error and opens without features.

Reload is the canonical `uix.reload` substrate request. It rejects while an Agent turn or feature-channel operation is active. An idle reload commits settled turn state, replaces Workspace features, rebuilds every live Agent feature bag, reloads initialized Pi runtimes, and restores each viewpoint. Cleanup failures do not stop forward replacement after the old generation clears. Workspace-scoped surface publication follows restoration, so every attached client refreshes its composition before reload reports collected failures. Requests serialize through `WorkspaceReloadCoordinator`.

## Channels and resources

A shared `ChannelContract` defines local request, response, and event schemas without naming a feature. Backend code adds handlers with `withHandlers()` and obtains contract-bound event publishers through the injected feature context. UIX derives their canonical namespace from the feature whose Workspace or Agent factory contributes them.

Each workspace runtime owns one `ChannelRegistry` that resolves owner-scoped ids, validates requests and responses, and tracks the live namespaces backed by admitted contracts. Workspace handlers run directly. An Agent channel contract selects a handler from the prepared dispatch's accepted Agent guard. Each Agent instance owns those handler closures. Routing values do not enter feature payloads.

A runtime-created attachment prepares each canonical request with immutable guarded context and the registry entry's log policy. Each host records the physical crossing and invokes that prepared dispatch. The surface composition projects the registry's namespace catalog. A surface declares every consumed namespace in one contract map and receives typed request and event clients under the matching keys. Client creation rejects unavailable namespaces, and event clients validate incoming payloads.

Each workspace runtime admits viewpoint web route contracts under their feature-derived namespaces. Each Agent instance owns the matching handlers. Every accepted attachment-target generation receives one private opaque web binding. Host-neutral web dispatch resolves a live binding and retains that exact Agent instance. It validates the local route and input, invokes the handler, and returns a finite response. Both hosts deliver these responses through their shared content transport. Electron encodes feature roots under `uix-resource://{feature}.viewpoint.{workspace}/{binding}/`. The server uses `/workspaces/:workspace/viewpoints/:binding/:feature/`. Host-owned binding snapshots recreate mounted feature-scoped `WebRouteClient` capabilities on retarget, independently of connection recovery. Old bindings reject new work while accepted reads retain their original Agent.

Electron IPC and the server's correlated WebSocket protocol are the implemented physical channel transports. The server detects dead sockets with ping/pong. Its browser adapter reconnects to the canonical session with capped backoff and rejects disconnected requests without replay. The connection version observable makes mounted snapshot consumers resubscribe and rehydrate after the browser accepts a replacement connection. Runtime events have workspace or session scope. Only matching attachments receive them. Canvas iframe writeback still uses a feature-owned `postMessage` shim before entering typed channels. A general iframe channel adapter does not exist.

Logical `uix-resource://` addresses dispatch normalized feature resource routes. Electron registers the physical protocol once and selects a workspace-qualified runtime handler. Each Electron protocol request retains an independent workspace guard through response completion. The server browser adapter maps the same address to workspace-qualified HTTP with the same guard lifetime. Versioned surface modules, CSS, and assets retain exact bytes under immutable cache policy. Mutable resources default to `no-store`. Surface bundles and files use a reserved logical substrate origin. Canvas loads its iframe directly from the typed `/view?key=...` viewpoint route. Its handler inserts a self-removing browser shim into a served copy of canonical HTML. The substrate returns that body unchanged. The shallow page URL gives nested Canvas keys native directory-relative and fragment addressing. There is no Canvas read channel, bootstrap resource, or parent HTML-load message.

## Surface and workspace runtime

The renderer owns one workspace page. It requests the live surface list, dynamically imports each content-hash-busted bundle, and mounts each surface behind an error boundary.

Esbuild bundles surface entry modules on demand. Virtual shared modules preserve the page's React, TypeBox, and `@uix/api` instances. CSS module scripts remain external and retain explicit cascade order.

The mount path adopts each surface stylesheet inside a structural `@scope`. Name-global CSS declarations still require feature-prefixed names.

The workspace renderer also owns actions, keybinding synchronization, and the active attachment-target session projection. Feature surfaces register action trees through scoped React context. Consumers receive a serializable flat catalog and id-based invocation.

Main persists portable keybindings under `settings.keybindings`. The renderer resolves platform gestures, identifies conflicts, and dispatches only confirmed unique bindings. The substrate contributes `uix.reload` with `mod+r`. Electron's native menu routes through the focused renderer action registry, so native selection and browser keybindings reach the same canonical request. The action appears in the public catalog, though a default command-palette feature has not landed.

## Settings and durable state

`WorkspaceManifestStore` stages, promotes, and atomically flushes manifest generations. Disk remains authoritative across reload. Debounced writes reject stale generation locations.

`SettingsRegistry` owns live complete scopes. Feature definitions declare one TypeBox object or record schema plus an optional whole-object default. Defaults materialize into persisted state instead of remaining live overlays.

The substrate registers `agent` and `keybindings` workspace namespaces. Features receive only their bound `ctx.settings` handle. Surfaces receive a feature-bound settings client.

`DocumentStore` persists mutable current bytes and caller-supplied immutable versions under stable ids. Workspace factories receive the Workspace document factory. Agent factories receive a viewpoint-scoped factory: mutable current bytes are private to that session, while immutable versions remain shared. Each Agent instance owns a `CanvasDocumentBuffer` with its local HTML, anchors, and document heads.

Turn-state contributions define named schema-bound cells. Each Agent instance owns its registry and coordinator for its session viewpoint. It restores branch values before the instance is admitted, commits changed snapshots at run boundaries and teardown, and participates in guarded Workspace reload. The tools, channel handlers, model context, and turn-state callbacks returned by one Agent factory close over the same local feature state.

Agent-context contributions materialize hidden model-visible sections. One assembler combines active sections into a `uix.state` message and provides a generated vocabulary section to the system prompt.

UIX exposes no public arbitrary filesystem watcher. External manifest changes take effect through reload.

## Agent runtime

Each workspace runtime owns one `WorkspaceAgentRuntime`. Its `AgentInstanceSupervisor` maps session ids to guarded primary agent instances with single-flight creation and immediate zero-guard teardown policy. Each instance owns an independent Pi `SessionManager`, branch-restored state, and at most one lazily booted `AgentSessionRuntime`. History and session summaries remain available before Pi execution starts.

Attachments hold replaceable target guards. Prepared requests, running turns, reload, and teardown-sensitive work hold independent guards for their complete asynchronous use. Several attachments to one session share its instance, while different sessions remain independently supervised.

UIX stores sessions under the workspace state root. One application-owned Pi app data directory under Electron `userData` provides credentials, settings, models, and extension resources across workspaces.

Each instance owns its Agent facet registries and creates Pi with built-in tools inactive. Manifest features therefore define the complete UIX-selected tool surface. Internal installers adapt that instance's registries into Pi.

The substrate agent contract handles prompts, history, recent summaries, attachment retargeting, titles, model selection, favorites, provider authentication, and session-scoped live events. Prompt and New Session mutations include client-supplied identities. Accepted prompts write a durable idempotency intent before execution. New Session uses its mutation identity as the durable session id. Reconnect therefore never requires automatic mutation replay. Chat consumes that contract as an ordinary feature.

Pi's `ModelRuntime` remains authoritative for providers, models, and authentication interactions. UIX projects available models and provider-owned login methods without persisting credentials itself.

Main projects live and replayed Pi entries into one `TranscriptSnapshot` model. Streaming assistant text appends through partial events. Tool progress uses replacement snapshots. Completed items replace one row.

Tool transcript items retain their execution working directory. Main derives file locations for supported filesystem tools, so historical rows do not reinterpret paths against later state.

## First-party feature composition

The repository manifest composes these ordinary features:

- **Chat:** Provides the conversation surface, session and model controls, provider login, Markdown rendering, syntax highlighting, and specialized tool presentations.
- **Workspace tools:** Provides exact-name reason-bearing `read`, `write`, and `command` tools plus passthrough `edit`.
- **Canvas:** Provides contained HTML documents with per-Agent anchored buffers, direct viewpoint reads, and a writeback channel. It also contributes turn state, agent context, prompt guidance, and an authoring skill. `canvas.changed` reloads the selected document URL after Agent writes or restoration. Human writeback does not echo a refresh. The parent checks iframe source and origin and persists prompt-action HTML before forwarding the prompt, rejecting pending actions after viewpoint replacement or unmount. Canonicalization rejects authored `<base href>` elements. The served shim removes itself before authored scripts run and never enters stored HTML or anchored reads.

None of these features is a compiled-in substrate default. Bare workspaces start with editable passthrough Pi tool source instead.

## Active build edges

The active plans track work that is not architecture yet:

- [`two-host-behavioral-conformance.md`](../../plans/two-host-behavioral-conformance.md) drives shared scenarios through the real Electron and server hosts before declaring parity gaps.
- [`explicit-app-and-workspace-ownership.md`](../../plans/explicit-app-and-workspace-ownership.md) moves the reference features and dogfood manifest into explicit app-owned roots.
- [`chat-rendering-polish.md`](../../plans/chat-rendering-polish.md) continues thinking rendering, thinking controls, performance, and final documentation.
- [`chat-provider-login.md`](../../plans/chat-provider-login.md) continues no-model onboarding and model-picker connection entry points.
- [`workspace-actions-and-command-palette.md`](../../plans/workspace-actions-and-command-palette.md) continues ambient surfaces, palette UI, and customization.
- [`session-history-and-switching.md`](../../plans/session-history-and-switching.md) retains defensive hardening and final verification.
- [`durable-transcript-identity.md`](../../plans/durable-transcript-identity.md) retains durable low-frequency block state.
- [`canvas-reusable-assets.md`](../../plans/canvas-reusable-assets.md) gives Canvas a reusable local web-asset library in eight reviewable units.
- [`cross-feature-capabilities-and-resource-viewing.md`](../../plans/cross-feature-capabilities-and-resource-viewing.md) establishes publisher-qualified public protocols, document resources, and resource viewers after identity and selection details settle.
- [`framework-neutral-surfaces-and-shell.md`](../../plans/framework-neutral-surfaces-and-shell.md) moves frontend frameworks into feature ownership in post-alpha stages.
- [`persistence-and-session-foundation.md`](../../plans/persistence-and-session-foundation.md) specifies the file-backed session and branch-restoration foundation. C0/C1 have landed and C2–C5 remain deferred.
- [`workspace-first-render-gate.md`](../../plans/workspace-first-render-gate.md) shows a substrate-owned loading overlay until the initial composition restores and renders.

The complete build map lives in [`AGENTS.md`](../../plans/AGENTS.md). Unresolved architecture questions live in [`open-questions.md`](./open-questions.md).
