---
summary: "Split UIX into a host-neutral workspace runtime, browser client, server host, and Electron host in one monorepo; prove local browser operation first, then make the unbootstrapped server and batteries-included Electron product independently packageable."
status: active
---

# Electron/server split

## Status and intent

This is a low-resolution architecture and distribution plan, recorded while UIX is still around 0.5 alpha. It is intentionally independent of any API-stability or product-version milestone: completing the split does not imply that the public API is locked. It establishes the direction and dependency order, not the final server protocol, package names, deployment model, or security architecture. Promote each unit into a narrower design/decision/build slice when it approaches implementation.

UIX must run as a local server with no Electron dependency: start it against an existing workspace, open the workspace in an ordinary browser, and retain the same feature, surface, channel, agent, persistence, and reload semantics as the current Electron application. Electron remains a supported packaged host over that same runtime rather than the definition of the runtime.

The monorepo should make the product boundary visible. The UIX server is the unbootstrapped substrate for an audience already using agents to build its own apps; it should not implicitly install chat, canvas, future developer skills, or another default experience. A future batteries-included Electron product, currently envisioned as **Fruition**, is a distinct composition and brand for people who may only know consumer web ChatGPT and have no agent-development or vibe-coding background. Fruition is a north star that tests the boundary—its onboarding, defaults, templates, and product UX must be able to live above UIX—but building or migrating Fruition is not a deliverable of this plan.

This plan builds on [hosting-compatible by default](../decisions/2026-05-31-hosting-compatible-by-default.md), [features are the loadable unit](../decisions/2026-07-01-features-are-the-loadable-unit.md), [workspace manifest, not discovery](../decisions/2026-07-02-workspace-manifest-not-discovery.md), [runtime surface pipeline](../decisions/2026-07-02-runtime-surface-pipeline.md), and the current [workspace composition synthesis](../design/workspace-feature-composition.md). The implementation should follow the [human-paced loop](../architecture/human-paced-implementation.md): each unit below is a direction, not permission to land the whole split in one pass.

## Target shape

```text
                         ┌────────────────────────────┐
                         │ host-neutral UIX runtime   │
                         │ workspace, features, agent │
                         │ registries, state, reload  │
                         └─────────────┬──────────────┘
                                       │ host ports
                    ┌──────────────────┴──────────────────┐
                    │                                     │
          ┌─────────▼─────────┐                 ┌─────────▼─────────┐
          │ UIX server host   │                 │ Electron host     │
          │ HTTP + live bus   │                 │ IPC + protocols   │
          └─────────┬─────────┘                 └─────────┬─────────┘
                    │                                     │
          ┌─────────▼─────────────────────────────────────▼─────────┐
          │ shared browser-compatible workspace client and surfaces │
          └──────────────────────────────────────────────────────────┘
```

The runtime owns UIX semantics. Hosts own process lifecycle and transport mechanisms. The browser-compatible client consumes one logical channel/resource API through a host-selected adapter. Electron-specific capabilities are optional host capabilities, not ambient assumptions in features or the runtime.

The likely monorepo boundaries are conceptually:

- **API/contracts** — public feature contracts and transport-neutral shared types;
- **runtime** — workspace activation, registries, agent driver, stores, settings, reload, and other host-neutral backend behavior;
- **web client** — the workspace renderer and browser-side client abstractions;
- **server host** — HTTP/resource delivery, live channel transport, CLI/process lifecycle, and browser entry;
- **Electron host** — app/window lifecycle, native dialogs, external URL opening, IPC, custom protocols, and desktop packaging;
- **optional product compositions** — defaults and onboarding such as future Fruition, outside the substrate packages.

These names and the physical package graph are deliberately unsettled until the existing import graph is inventoried. A monorepo split is required; publishing each internal package independently is not.

## Load-bearing boundaries

- **One runtime, not parallel implementations.** Electron and the server must instantiate the same workspace runtime. A server-shaped rewrite beside the existing Electron composition root would create two UIX semantics and is not an acceptable intermediate destination.
- **One logical channel API, host-selected transports.** Electron IPC and the server live transport implement the same request/event behavior, validation, error semantics, subscription lifetime, and sensitive-log policies. Transport framing is not a feature concern.
- **One logical resource router, host-selected encodings.** Resource and surface contributions resolve through a host-neutral dispatcher. Electron custom-protocol URLs and server HTTP URLs are encodings of the same route/origin policy, not separate registries.
- **The renderer is browser code.** The workspace page and feature surfaces cannot require preload or Electron globals. A small bootstrap may select or construct the current host transport.
- **Local server safety is designed, not deferred.** The first server may bind only to loopback and support one trusted local user, but origin checks, capability exposure, secret handling, bind-address defaults, and the line between local and remote threat models must be explicit before it ships.
- **Remote hosting is survivable, not delivered here.** Reconnect semantics and transport boundaries must not preclude a remote host, but identity, tenancy, VM isolation, multi-user concurrency, remote content stores, and public deployment are later work.
- **Composition is not distribution.** A bare UIX server opens the workspace manifest it is given and does not silently add features. Chat/canvas/dev skills can remain repository dogfood or templates during migration, but their presence must not be required by the runtime or server package.
- **Desktop affordances are injected capabilities.** Window management, native file selection, tray behavior, system-browser opening, updater integration, and app data locations belong to the Electron/product host. Runtime consumers either receive a capability or expose an honest host-neutral workflow.

## Units

### E0 — Inventory and name the host contract

Map everything currently composed in `src/main/index.ts` and classify it as runtime semantics, Electron host behavior, renderer bootstrap, or an unresolved capability. Trace direct and transitive Electron dependencies, including IPC registration, custom protocols, `BrowserWindow`, dialogs, `shell.openExternal`, app lifecycle, `userData`, packaged resource paths, logging, recents, picker/scaffolding, keyboard dispatch, and development-server assumptions.

From that inventory, write the smallest host contract needed to instantiate one workspace runtime. Decide ownership and lifetime vocabulary before moving files. Keep this unit behavior-preserving and avoid introducing a general plugin/adapter framework: define ports only for concrete effects the runtime already performs.

Acceptance: every Electron dependency has an intended owner; the proposed runtime can be described without `Electron.App`, `BrowserWindow`, `ipcMain`, or `protocol`; unresolved cases are named rather than hidden in a generic escape hatch.

### E1 — Extract the host-neutral runtime composition root

Move workspace-scoped construction out of the Electron entry into a callable runtime with an explicit lifetime and dependencies. It should own feature loading, facet registries, agent/session behavior, settings, stores, reload, and the transport-neutral halves of channels/resources. The Electron entry should instantiate this runtime through adapters while preserving current behavior.

Separate app-global state from workspace state as part of the extraction. Do not solve concurrent workspaces unless the extraction makes it unavoidable, but do not bake `BrowserWindow` or Electron app singleton types into the new runtime boundary.

Acceptance: Electron dogfood behaves as before, runtime tests instantiate the workspace backend without importing or booting Electron, and disposing the runtime releases all workspace-scoped registrations.

### E2 — Make channels independently hostable

Turn the existing channel seam into an explicit backend transport binding and browser transport client. Preserve contract-derived validation, canonical ids, request/response errors, event publication, disposal, and sensitive log descriptions. Add the minimum connection/session concept needed for a browser client; specify what happens on disconnect and reconnect before relying on long-lived subscriptions.

Choose the local server live transport only in this unit. WebSocket is the expected candidate, but the decision should compare it against streaming/fetch alternatives using the actual channel operations rather than treating it as predetermined.

Acceptance: the same channel conformance suite runs against the Electron adapter and an in-memory or server adapter, and a browser transport can execute at least the substrate workspace catalog plus one feature request/event path.

### E3 — Make resources and surfaces independently hostable

Separate resource dispatch from Electron protocol registration. Bind the same normalized resource routes, origin policies, response metadata, surface-module pipeline, assets, CSS modules, cache hashes, and failure behavior to HTTP. Define the browser page origin and URL-generation context without leaking Electron schemes into feature code.

This unit must revisit CSP, CORS, iframe origins, generated/foreign surface containment, workspace/feature origin partitioning, path traversal defenses, cache semantics, and development versus production asset resolution. The HTTP layout should remain compatible with a future remote host, but subdomains, TLS termination, and multi-tenant routing are not required for the local proof.

Acceptance: an ordinary supported browser can load the workspace shell, dynamically load manifest-contributed surfaces, fetch their assets/resources, and preserve the existing isolation policy without Electron custom protocols.

### E4 — Ship a local, unbootstrapped UIX server workflow

Add a server executable/CLI that opens an explicit existing workspace, binds safely to loopback by default, reports its URL, and shuts down cleanly. Decide the initial browser-launch behavior, port selection, app-data/profile location, logging, signals, stale-process handling, and actionable startup failures. There is no start picker or create-workspace onboarding requirement: a missing or invalid workspace is a CLI error.

The server distribution must not scaffold or enable chat, canvas, or dev skills implicitly. Repository development may keep its current dogfood workspace, but tests must include a minimal workspace whose feature list does not depend on the batteries-included set.

Acceptance: on macOS and a Linux/container-like environment, a user can point the server at a workspace, open the printed local URL in a regular browser, use its contributed surfaces and agent channels, reload features, and persist/reopen state. The process does not install or load Electron.

### E5 — Establish monorepo package and build boundaries

After the runtime and both hosts reveal their real imports, move them into explicit workspace packages/apps and give each target an independent build and test entry. Avoid a speculative up-front directory migration; use the proven dependency direction to prevent the runtime or server from depending on Electron or batteries.

Decide which artifacts are bundled versus external, how `@uix/api` self-resolution works for feature loading, how readable feature source is addressed in development and packaged products, and whether internal packages remain private. Keep one lockfile and coordinated repository checks unless release needs prove otherwise.

Acceptance: dependency checks make the intended direction enforceable; the server can build/install without Electron; Electron can build by depending on runtime/client packages; and shared conformance tests run once per host adapter.

### E6 — Recast Electron as a packaged host/product slot

Make Electron consume the extracted runtime and shared web client exclusively through the established host seams. Retain the native window/picker behavior needed by the current application, then decide which remaining defaults belong to a generic UIX desktop host versus the future Fruition composition. Complete the existing packaged-binary work for readable feature/template resources only for the product that elects to ship those templates.

This unit creates the slot in which Fruition can later own branding, onboarding, chat/canvas/dev-skill defaults, installers, updates, tray behavior, and consumer-oriented account setup. It does not design or ship that product.

Acceptance: the Electron artifact and headless server are independently buildable distributions over the same UIX runtime; removing batteries from the server has no effect on the runtime contract; and Electron-only code is confined to the Electron/product side of the package graph.

### E7 — Server shipping-readiness and parity gate

Define the supported browser/OS matrix and a parity suite covering workspace activation, channel validation, event fan-out, feature reload, surface/resource loading, agent login callbacks, persistence, shutdown, error presentation, and secret redaction. Document intentional host differences. Add server operational documentation for bind addresses, data/workspace volumes, logs, upgrades, and recovery.

Perform a focused threat review of the local server before calling it a supported distribution. Any option that permits non-loopback binding must be gated behind an explicit security model; “local mode with the bind address changed” is not a remote-hosting architecture.

Acceptance: Electron and local-server modes pass their shared semantic suite, documented differences are product/host differences rather than accidental drift, and the unbootstrapped server is supportable as a first-class UIX distribution without implying API stability beyond the project's declared maturity.

## Decisions deliberately deferred

- Exact monorepo tool and final package names.
- HTTP framework and live transport protocol.
- Wire framing, protocol versioning, reconnect/resume, and backpressure details.
- Whether the browser is opened automatically and how a future tray launcher participates.
- Local authentication/bootstrap-token UX and the boundary at which non-loopback access is allowed.
- Multiple simultaneous workspaces, processes, tabs, and clients.
- Remote identity, tenancy, authorization, collaboration, VM/container isolation, and hosted persistence.
- Whether Electron remains a generic UIX distribution once Fruition exists or Fruition becomes the only maintained Electron product.
- Fruition branding, onboarding, feature set, subscription/provider UX, updater, installer, and release lifecycle.
- Independent publication/versioning or future repository extraction of product packages.

## Not in this plan

- Replacing Electron with Tauri or another desktop shell.
- Building the Fruition product or designing its consumer experience.
- Migrating all current first-party features out of this repository before the runtime boundary requires it.
- A public remote-hosted UIX service.
- Hostile-feature sandboxing or arbitrary multi-tenant feature execution.
- Making UIX a marketplace or adding implicit feature discovery/bootstrap behavior.

## Planning checkpoints

Before E1, distill E0's runtime/host ownership into a design update and decision if it changes the current meaning of App, workspace, Host, or main. Before E2/E3, write transport/resource decisions from executable spikes. Before E4 ships, record the local server threat model and operational contract. Before E5, use the observed import graph—not this document's illustrative package list—to settle the physical monorepo layout. Before E6, decide the generic-UIX-desktop versus Fruition ownership line with product context available at that time.
