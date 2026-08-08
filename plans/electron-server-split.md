---
summary: "Split UIX into a host-neutral workspace runtime, browser client, server host, and Electron host in one monorepo. Prove local browser operation first, then make the unbootstrapped server and the batteries-included Electron product independently packageable."
---

# Electron/server split

## Status and intent

We recorded this low-resolution architecture and distribution plan while UIX is still around 0.5 alpha. It is intentionally independent of any API-stability or product-version milestone: completing the split does not imply that the public API is locked. It establishes the direction and dependency order, not the final server protocol, package names, deployment model, or security architecture. Promote each unit into a narrower design/decision/build slice when it approaches implementation.

UIX must run as a local server with no Electron dependency. Start it against an existing workspace, and open the workspace in an ordinary browser. It retains the same feature, surface, channel, agent, persistence, and reload semantics as the current Electron application. Electron remains a supported packaged host over that same runtime rather than the definition of the runtime.

The monorepo should make the product boundary visible. The UIX server is the unbootstrapped substrate for an audience already using agents to build its own apps. It should not implicitly install chat, canvas, future developer skills, or another default experience. A future batteries-included Electron product, currently envisioned as **Fruition**, is a distinct composition and brand. It targets people who may only know consumer web ChatGPT and have no agent-development or vibe-coding background. Fruition is a north star that tests the boundary. Its onboarding, defaults, templates, and product UX must be able to live above UIX. Building or migrating Fruition is not a deliverable of this plan.

This plan builds on [hosting-compatible by default](../docs/decisions/2026-05-31-hosting-compatible-by-default.md), [features are the loadable unit](../docs/decisions/2026-07-01-features-are-the-loadable-unit.md), [workspace manifest, not discovery](../docs/decisions/2026-07-02-workspace-manifest-not-discovery.md), [runtime surface pipeline](../docs/decisions/2026-07-02-runtime-surface-pipeline.md), and the current [workspace composition synthesis](../docs/design/workspace-feature-composition.md). The implementation should follow the [human-paced loop](../docs/architecture/human-paced-implementation.md): each unit below is a direction, not permission to land the whole split in one pass.

## Distribution direction (2026-08-08)

Refinement of the product shape while tier-1 work is still pre-E0. Three tiers consume one runtime:

- **Core UIX (tier 1)** is the runtime, server host, web client, and a `uix serve` CLI. It is **Electron-free**. Engineers run the server against a workspace and open the printed URL in a browser. The status-bar launcher is a native macOS menu-bar supervisor. It spawns and supervises the server binary and opens workspaces in tabs. It is convenience, not a product. Any rich UI beyond the native menu is itself a UIX app in the browser. Servers (CLI- or launcher-started) announce themselves through a well-known registry, so discovery does not depend on who spawned them.
- **Fruition (tier 2)** is a separate batteries-included composition over the same runtime. It is an Electron host with defaults, skills, and guardrails. It starts as an in-repo product composition before it earns its own repo.
- **Hosted Fruition (tier 3)** is the same server host run per-user in a VM, subdomain-isolated. Identity, tenancy, OAuth, and a feature marketplace are platform-layer work, explicitly not built for a long time. Tier-1 seams must survive it.

Distribution mechanics: the server ships as a Node SEA binary with Pi versioned at build time. Model currency flows through Pi's remote catalog (pi.dev overlay, ~4h refresh, verified in Pi 0.82). Distribution cadence is therefore decoupled from model releases. Rebuild automation on Pi releases is the intended update path. User-overridable Pi is deferred unless a need appears. Everything above the substrate (browser client, Fruition window, hosted product, launcher UI) is a UIX app.

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

- **API/contracts**: public feature contracts and transport-neutral shared types.
- **runtime**: workspace activation, registries, agent driver, stores, settings, reload, and other host-neutral backend behavior.
- **web client**: the workspace renderer and browser-side client abstractions.
- **server host**: HTTP/resource delivery, live channel transport, CLI/process lifecycle, and browser entry.
- **Electron host**: app/window lifecycle, native dialogs, external URL opening, IPC, custom protocols, and desktop packaging.
- **optional product compositions**: defaults and onboarding such as future Fruition, outside the substrate packages.

We deliberately leave these names and the physical package graph unsettled until we inventory the existing import graph. A monorepo split is required. Publishing each internal package independently is not.

## Load-bearing boundaries

- **One runtime, not parallel implementations.** Electron and the server must instantiate the same workspace runtime. A server-shaped rewrite beside the existing Electron composition root would create two UIX semantics and is not an acceptable intermediate destination.
- **One logical channel API, host-selected transports.** Electron IPC and the server live transport implement the same request/event behavior, validation, error semantics, subscription lifetime, and sensitive-log policies. Transport framing is not a feature concern.
- **One logical resource router, host-selected encodings.** Resource and surface contributions resolve through a host-neutral dispatcher. Electron custom-protocol URLs and server HTTP URLs are encodings of the same route/origin policy, not separate registries.
- **The renderer is browser code.** The workspace page and feature surfaces cannot require preload or Electron globals. A small bootstrap may select or construct the current host transport.
- **Local server safety is designed, not deferred.** The first server may bind only to loopback and support one trusted local user. Origin checks, capability exposure, secret handling, bind-address defaults, and the line between local and remote threat models must be explicit before it ships.
- **Remote hosting is survivable, not delivered here.** Reconnect semantics and transport boundaries must not preclude a remote host. Identity, tenancy, VM isolation, multi-user concurrency, remote content stores, and public deployment are later work.
- **Composition is not distribution.** A bare UIX server opens the workspace manifest the caller gives it and does not silently add features. Chat/canvas/dev skills can remain repository dogfood or templates during migration, but the runtime or server package must not require their presence.
- **Desktop affordances are injected capabilities.** Window management, native file selection, tray behavior, system-browser opening, updater integration, and app data locations belong to the Electron/product host. Runtime consumers either receive a capability or expose an honest host-neutral workflow.

## Units

### E0: Inventory and name the host contract

Map everything currently composed in `src/main/index.ts` and classify it as runtime semantics, Electron host behavior, renderer bootstrap, or an unresolved capability. Trace direct and transitive Electron dependencies. Include IPC registration, custom protocols, `BrowserWindow`, dialogs, `shell.openExternal`, app lifecycle, `userData`, packaged resource paths, logging, recents, picker/scaffolding, keyboard dispatch, and development-server assumptions.

From that inventory, write the smallest host contract needed to instantiate one workspace runtime. Decide ownership and lifetime vocabulary before moving files. Keep this unit behavior-preserving and avoid introducing a general plugin/adapter framework: define ports only for concrete effects the runtime already performs.

#### Inventory (2026-08-08)

The Electron surface is six production files. `src/main/index.ts` owns app lifecycle, windows, menu, picker, dialogs, recents, and packaged paths. `src/main/ipc.ts` is the channel transport over `ipcMain`/`webContents`. `src/main/resource-registry.ts` is the `uix-resource` custom protocol. `src/main/lifecycle.ts` provides app/window event helpers. `src/main/external-links.ts` routes window navigation to `shell.openExternal`. `src/preload/index.ts` is the renderer transport client. Everything else in `src/main` is host-neutral fs/path/Pi work.

`openWorkspace()` is already almost entirely runtime. It builds the document store, manifest store, settings, and feature loader. It owns all eight facet registries, the agent driver, the surface pipeline, and the reload coordinator. The `uix`/`agent` channel handlers are runtime too. The host pieces inside it are the window, the menu, the channel transport closures, `openExternal`, `userData` paths, and the templates path.

The smallest host contract is five ports. Each is a concrete effect the runtime already performs:

1. **Channel transport**: `registerHandler(id, handler, logOpts)` plus `publish(channel, payload, logOpts)`. Electron binds IPC today. The server binds a live bus later (E2).
2. **Resource serving**: serve normalized routes on the reserved substrate origin. Electron uses the custom protocol. The server uses HTTP (E3).
3. **Capabilities**: `openExternal(url)`, the Pi profile dir, the templates dir, and the page source (dev URL or packaged files).
4. **Workspace target**: the host picks the workspace. The runtime owns everything workspace-scoped, which is already the `appBag`/`openWorkspace` boundary.
5. **Process lifecycle**: the host starts and stops the process. The runtime owns the workspace-scoped bag and disposes on close.

Ownership calls and unresolved cases:

- Recents and the start picker stay host chrome. The server CLI (E4) takes an explicit target and has no picker.
- The menu reload binding is host chrome. The reload coordinator is runtime. The server needs a page-side or CLI reload trigger.
- `ELECTRON_RENDERER_URL` and `app.isPackaged` are Electron dev assumptions. The server dev story differs (E3).
- Packaged resource paths (preload, renderer html, icon, templates) are Electron packaging specifics. The server has its own layout (E5).
- `apiModuleDir` resolves from `app.getAppPath()`. The server resolves `@uix/api` from its own install (E5 self-resolution).
- `installProcessHandlers` is Node-neutral and stays shared.

Acceptance status: every Electron import has an owner above. The runtime is describable without `Electron.App`, `BrowserWindow`, `ipcMain`, or `protocol`. E1 extracts `openWorkspace` into a runtime constructor taking these ports.

Acceptance: every Electron dependency has an intended owner. The proposed runtime can be described without `Electron.App`, `BrowserWindow`, `ipcMain`, or `protocol`. The work names unresolved cases rather than hiding them in a generic escape hatch.

### E1: Extract the host-neutral runtime composition root

Move workspace-scoped construction out of the Electron entry into a callable runtime with an explicit lifetime and dependencies. It should own feature loading, facet registries, agent/session behavior, settings, stores, reload, and the transport-neutral halves of channels/resources. The Electron entry should instantiate this runtime through adapters while preserving current behavior.

Separate app-global state from workspace state as part of the extraction. Do not solve concurrent workspaces unless the extraction makes it unavoidable. Also do not bake `BrowserWindow` or Electron app singleton types into the new runtime boundary.

Acceptance: Electron dogfood behaves as before, runtime tests instantiate the workspace backend without importing or booting Electron, and disposing the runtime releases all workspace-scoped registrations.

### E2: Make channels independently hostable

Turn the existing channel seam into an explicit backend transport binding and browser transport client. Preserve contract-derived validation, canonical ids, request/response errors, event publication, disposal, and sensitive log descriptions. Add the minimum connection/session concept needed for a browser client. Specify what happens on disconnect and reconnect before relying on long-lived subscriptions.

Choose the local server live transport only in this unit. WebSocket is the expected candidate, but the decision should compare it against streaming/fetch alternatives using the actual channel operations rather than treating it as predetermined.

Acceptance: the same channel conformance suite runs against the Electron adapter and an in-memory or server adapter. A browser transport can execute at least the substrate workspace catalog plus one feature request/event path.

### E3: Make resources and surfaces independently hostable

Separate resource dispatch from Electron protocol registration. Bind the same normalized resource routes, origin policies, response metadata, surface-module pipeline, assets, CSS modules, cache hashes, and failure behavior to HTTP. Define the browser page origin and URL-generation context without leaking Electron schemes into feature code.

This unit must revisit CSP, CORS, iframe origins, generated/foreign surface containment, workspace/feature origin partitioning, path traversal defenses, cache semantics, and development versus production asset resolution. The HTTP layout should remain compatible with a future remote host, but subdomains, TLS termination, and multi-tenant routing are not required for the local proof.

Acceptance: an ordinary supported browser can load the workspace shell and dynamically load manifest-contributed surfaces. It fetches their assets/resources and preserves the existing isolation policy without Electron custom protocols.

### E4: Ship a local, unbootstrapped UIX server workflow

Add a server executable/CLI that opens an explicit existing workspace, binds safely to loopback by default, reports its URL, and shuts down cleanly. Decide the initial browser-launch behavior, port selection, app-data/profile location, logging, signals, stale-process handling, and actionable startup failures. There is no start picker or create-workspace onboarding requirement: a missing or invalid workspace is a CLI error.

The server distribution must not scaffold or enable chat, canvas, or dev skills implicitly. Repository development may keep its current dogfood workspace, but tests must include a minimal workspace whose feature list does not depend on the batteries-included set.

Acceptance: on macOS and a Linux/container-like environment, a user can point the server at a workspace. They open the printed local URL in a regular browser, use its contributed surfaces and agent channels, reload features, and persist/reopen state. The process does not install or load Electron.

### E5: Establish monorepo package and build boundaries

After the runtime and both hosts reveal their real imports, move them into explicit workspace packages/apps. Give each target an independent build and test entry. Avoid a speculative up-front directory migration. Use the proven dependency direction to prevent the runtime or server from depending on Electron or batteries.

Decide which artifacts are bundled versus external and how `@uix/api` self-resolution works for feature loading. Also decide how readable feature source is addressed in development and packaged products, and whether internal packages remain private. Keep one lockfile and coordinated repository checks unless release needs prove otherwise.

Acceptance: dependency checks make the intended direction enforceable. The server can build/install without Electron. Electron can build by depending on runtime/client packages. And shared conformance tests run once per host adapter.

### E6: Recast Electron as a packaged host/product slot

Make Electron consume the extracted runtime and shared web client exclusively through the established host seams. Retain the native window/picker behavior needed by the current application. Then decide which remaining defaults belong to a generic UIX desktop host versus the future Fruition composition. Complete the existing packaged-binary work for readable feature/template resources only for the product that elects to ship those templates.

This unit creates the slot in which Fruition can later own branding, onboarding, chat/canvas/dev-skill defaults, installers, updates, tray behavior, and consumer-oriented account setup. It does not design or ship that product.

Acceptance: the Electron artifact and headless server are independently buildable distributions over the same UIX runtime. Removing batteries from the server has no effect on the runtime contract. And the work confines Electron-only code to the Electron/product side of the package graph.

### E7: Server shipping-readiness and parity gate

Define the supported browser/OS matrix and a parity suite. The suite covers workspace activation, channel validation, event fan-out, feature reload, surface/resource loading, agent login callbacks, persistence, shutdown, error presentation, and secret redaction. Document intentional host differences. Add server operational documentation for bind addresses, data/workspace volumes, logs, upgrades, and recovery.

Perform a focused threat review of the local server before calling it a supported distribution. Gate any option that permits non-loopback binding behind an explicit security model. "Local mode with the bind address changed" is not a remote-hosting architecture.

Acceptance: Electron and local-server modes pass their shared semantic suite. Documented differences are product/host differences rather than accidental drift. The unbootstrapped server is supportable as a first-class UIX distribution without implying API stability beyond the project's declared maturity.

## Decisions deliberately deferred

- Exact monorepo tool and final package names.
- HTTP framework and live transport protocol.
- Wire framing, protocol versioning, reconnect/resume, and backpressure details.
- Whether the browser is opened automatically and how a future tray launcher participates. _(Direction resolved 2026-08-08: native menu-bar supervisor plus SEA binary, see Distribution direction.)_
- Local authentication/bootstrap-token UX and the boundary at which the runtime allows non-loopback access.
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

Before E1, distill E0's runtime/host ownership into a design update and decision if it changes the current meaning of App, workspace, Host, or main. Before E2/E3, write transport/resource decisions from executable spikes. Before E4 ships, record the local server threat model and operational contract. Before E5, use the observed import graph, not this document's illustrative package list: to settle the physical monorepo layout. Before E6, decide the generic-UIX-desktop versus Fruition ownership line with product context available at that time.
