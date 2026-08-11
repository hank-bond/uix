---
summary: "Build explicit Electron and server hosts around a shared browser client, host-side workspace supervisor, and exactly-one-workspace runtime instances. Prove concurrent workspace and agent-instance isolation before migrating hosts, then add launcher, live transport, HTTP resources, and distribution readiness."
---

# Electron and server hosts

## Unit status

- **H0** baseline established (commit before H1).
- **H1** ownership roots and dependency enforcement landed.
- **H2** in-memory host/runtime boundary proof landed.
- **H3** real workspace runtime landed. The openWorkspace substrate moved into `packages/runtime`. `createWorkspaceRuntime` composes it over host ports, and the Electron app consumes it without host migration. The H3 isolation suite proves two concurrent workspaces with duplicate feature, channel, resource, and settings ids.

## Status and intent

This plan replaces the earlier transport-first Electron/server split. The discarded spike proved that Electron-independent runtime code and a WebSocket adapter are possible. It also let Electron's global handler and broadcast model shape the transport boundary before host, workspace, attachment, and client ownership were clear. The rebuilt path treats that work as evidence rather than an implementation base.

The highest-risk questions land first as executable architecture:

1. Can two real workspace runtimes with duplicate feature, channel, and resource ids coexist and dispose independently in one process?
2. Can one workspace runtime host concurrent real Pi agents on separate sessions with single-flight boot, retention, retargeting, and safe teardown?
3. Can one attachment and scoped dispatch boundary support in-memory tests, Electron IPC, and WebSocket connections without feature contracts learning transport fields?

Broad source movement and host implementation follow only after those gates pass. A failed gate pauses the plan and reopens the design rather than adding compatibility around a wrong boundary.

The plan implements the synthesis in [`host-workspace-runtime-boundaries.md`](../docs/design/host-workspace-runtime-boundaries.md), [`agent-session-routing.md`](../docs/design/agent-session-routing.md), [`agent-instance-state.md`](../docs/design/agent-instance-state.md), [`product-and-distribution.md`](../docs/design/product-and-distribution.md), and [`workspace-feature-composition.md`](../docs/design/workspace-feature-composition.md). It retains the decisions that features are the loadable unit, manifests are the composition authority, surface delivery is runtime-built, and designs remain hosting-compatible. Implementation follows the [`human-paced-implementation.md`](../docs/architecture/human-paced-implementation.md) loop: complete one review unit, explain it, and wait for approval.

## Target topology

```text
Host process
├── launcher and workspace catalog
├── supervisor
│   ├── WorkspaceHandle → WorkspaceRuntime A
│   │   └── agent instance manager
│   └── WorkspaceHandle → WorkspaceRuntime B
│       └── agent instance manager
└── platform and transport adapters
```

The repository exposes this ownership from the beginning:

```text
packages/
  api/                 feature-author contracts
  runtime/             exactly one workspace's substrate semantics
  client/              launcher and workspace browser clients
  host/                shared host contracts and coordination, if the units prove this package

hosts/
  electron/            Electron composition root and adapters
  server/              server composition root and adapters

apps/
  features/            reusable app-layer feature implementations
  workspaces/          explicit reference and product compositions
```

The exact shared host package name remains reviewable in the first unit. The ownership boundary does not. Shared workspace supervision and launcher code stays outside every `WorkspaceRuntime`. Concrete Electron and server code remains colocated under separate host roots.

## Load-bearing boundaries

- **One runtime instance owns one workspace.** A host creates several instances in one process, and each lifetime bag isolates its workspace.
- **The supervisor owns workspace policy.** Workspace ids, runtime boot coalescing, workspace retention, and runtime teardown do not belong to a workspace runtime.
- **The runtime owns agent instances.** One primary instance per session is the first policy. Single-flight boot, attachment retention, retargeting, event scope, and safe turn-boundary teardown live inside the workspace runtime.
- **Hosts route, runtimes dispatch.** A host resolves workspace and physical connection context. A runtime validates canonical channel requests and emits explicitly scoped events. Feature payloads contain no transport or tenancy fields.
- **No global broadcast semantics.** Workspace, session, and agent-instance events reach only matching attachments. A transport can optimize subscription mechanics without redefining delivery scope.
- **One wire-log boundary.** Every channel crossing records through one chokepoint with per-contract redaction. The log can be neither dodged nor spoofed, and crossing lines stay identical across hosts.
- **The launcher precedes all runtimes.** A host can serve workspace catalogs with zero active workspaces. Launcher HTTP, CLI JSON, Electron, and native clients consume one machine-readable projection.
- **The browser client is host-neutral.** Shared launcher and workspace clients receive constructed adapters. They do not inspect Electron globals or select transports.
- **Resources have one logical dispatcher.** Electron protocols and server HTTP encode workspace-qualified routes over the same runtime-owned resource semantics.
- **Apps are explicit compositions.** Hosts do not silently install app features. Shared and workspace-local features remain explicit manifest references.
- **Lifetimes compose.** Host, supervisor, workspace runtime, active feature composition, attachment, and agent instance each have an explicit owner and disposal boundary.

## Review units

### H0: Discard the spike and establish the baseline

Begin implementation from the mainline behavior plus approved design, naming, and documentation changes. Do not migrate the unlanded transport-first runtime and WebSocket implementation forward. Preserve it only as a test and design reference. Re-adopt an independently useful change, such as the local `@uix/api` package, only when it fits the target dependency graph without upward imports.

Record the baseline Electron behavior and checks that later units must preserve. Remove or defer any unlanded decision whose conclusion depended on global broadcast or the old broadcast transport. Decide the fate of the two naming and lexicon commits that are not on main. Replay them after H1 establishes the target roots, or re-verify the vocabulary rules under main's configuration. A WebSocket choice may be recorded again after the scoped dispatch boundary proves it.

**Review gate:** The branch contains the approved design and this plan, and it passes the repository checks. No partial server transport or host-neutral runtime extraction predates the new boundary.

### H1: Establish ownership roots and dependency enforcement

Create the target package, host, and app roots with their package metadata, TypeScript boundaries, and import rules. Decide whether shared host contracts and the workspace supervisor earn `packages/host` or another explicit package. Decide where launcher/catalog schemas live without adding host operations to the feature-author API.

Keep this unit behavior-light. Do not migrate the full Electron application, features, or runtime yet. The purpose is to make illegal dependency directions visible before code moves:

- Runtime and client cannot import concrete hosts.
- Feature implementations can import author contracts but not runtime or host internals.
- Concrete hosts may compose runtime, client, and shared host code.
- App workspaces may reference shared or local features explicitly.

**Review gate:** The repository checks enforce the intended graph, and each ownership root has a clear entry responsibility. No placeholder abstraction claims behavior that later units have not proved.

### H2: Prove the host/runtime boundary in memory

Build the smallest executable contracts for workspace supervision, workspace handles, attachments, canonical request dispatch, and scoped event delivery. Candidate names remain reviewable, but the model must express:

- A supervisor acquiring a workspace handle through a single-flight boot promise.
- A handle creating an attachment for an initial session target.
- An attachment dispatching requests and retargeting its session.
- Workspace, session, and agent-instance event scopes.
- Workspace and attachment retention with deterministic disposal.
- A host-facing `WorkspaceHandle` interface whose only implementation is the local handle.

Use fake runtimes and agents. Avoid Electron, WebSocket, HTTP, Pi, and feature loading. The scenarios should prove two workspaces with identical canonical ids, several attachments on one session, independent retargeting, scoped event delivery, failed-target rollback, and disposal isolation.

**Review gate:** The in-memory scenarios read as the architecture described in the design notes. No contract assumes one global selected session or transport-wide broadcast, and runtime isolation is in-process through lifetime bags.

### H3: Prove concurrent real workspace runtimes

_Status: landed._ The openWorkspace substrate moved into `packages/runtime` behind `createWorkspaceRuntime`. It covers documents, manifest store, workspace settings, the settings and channel registries, the resource registry, turn state, agent registries, feature loading, surfaces, and reload. Dispatch is runtime-owned canonical. `src/main` now constructs one runtime over Electron ports and keeps only host chrome. The `runtime.test.ts` suite instantiates two real workspaces with duplicate ids and exercises activation, settings, documents, dispatch, resources, surfaces, reload, events, and disposal.

Move enough backend substrate into `packages/runtime` to implement a real `WorkspaceHandle` for exactly one workspace. Replace host handler registration with runtime-owned canonical dispatch. Keep channel and resource registries local to the runtime instance, and pass host-stamped attachment context into dispatch outside feature payloads. The E0 inventory in the appendix (from the discarded plan) already classified the Electron surface into runtime semantics and host behavior. Reuse it as the starting analysis.

Instantiate two real workspaces in one process with overlapping feature, channel, resource, and settings ids. Exercise feature activation, settings, document storage, surface registration, reload, and disposal. Process-global services must be host-owned or explicitly shared. Mutable workspace state cannot remain in module singletons.

Do not migrate Electron yet. Use in-memory host and resource adapters so failures reveal runtime isolation rather than platform behavior.

**Review gate:** Both workspaces run concurrently, reload independently, and retain duplicate local ids. Disposing either runtime removes only its state and routes. If the current lifetime bags do not form a complete workspace boundary, stop and revise the runtime composition before continuing.

### H4: Prove real agent instances

Replace the selected-session singleton inside one workspace runtime with the agent instance manager. The first target policy resolves each session to one primary agent instance, while the identity shape leaves room for later branch-bound or ephemeral agents.

Split workspace-scoped feature ownership from branch-viewpoint working state. The workspace runtime retains the accepted feature composition, settings, stores, and contribution definitions. Each agent instance owns its state at its session-branch viewpoint: the turn-state projection, agent context, Pi installation, and feature buffers that depend on that branch. Existing contribution APIs may need an instance-instantiation or context-aware callback boundary. Prove that boundary with real stateful features rather than sharing singleton closures across sessions.

Implement and test:

- Concurrent cold attachments awaiting one single-flight boot promise.
- Warm attachment to an existing instance.
- Two live agents on distinct sessions in one workspace runtime.
- Acquire-before-release attachment retargeting.
- Failed target acquisition preserving the accepted old instance.
- One active turn per primary instance, with a clear busy rejection for competing prompts.
- Immediate teardown of a zero-attachment idle instance.
- Teardown of a zero-attachment running instance after its safe turn boundary.
- A new attachment canceling pending teardown.
- Agent-instance events reaching every attachment on that instance.
- Two sessions retaining independent restored Canvas documents, anchors, turn state, and agent context.
- One attachment leaving a shared instance without committing, restoring, or disrupting peers.
- Final state commit and safe teardown only when the agent instance tears down.
- Workspace feature reload committing and reconciling every agent instance without cross-session state exchange.

Use real Pi integration rather than proving only a generic pool. A configurable warm-retention period, always-on instances, host-authored retention, multiple agents on one session, and branch coordination remain later policies.

**Review gate:** Real Pi sessions and stateful features satisfy the lifecycle above without process-global collisions, cross-session event leakage, or shared branch-state mutation. If Pi or feature state cannot support concurrent in-process instances, stop and revisit the state model. Neither host should depend on the shape first.

### H5: Extract the shared launcher and workspace clients

Move browser-compatible launcher and workspace UI into `packages/client`. Each entry receives a constructed client adapter from a host-owned client bootstrap. Remove ambient Electron detection from shared code. The page-shared module mechanism (the React, TypeBox, and `@uix/api` instances that bundled surfaces resolve against) moves with the workspace client.

Give the workspace client canonical workspace-session navigation and a transport connection epoch. The URL names each attachment's target. The workspace-only route resolves the fallback session and never implies one globally active session. Snapshot-backed state owners use one reusable recovery pattern rather than optional feature-by-feature reconnect callbacks. Inventory every event stream and classify it as a durable snapshot signal, an ordered live delta, or an explicitly lossy notification. Define pending mutation loss as an indeterminate outcome rather than a confirmed failure, and do not retry mutations automatically.

The launcher client consumes a host-level catalog projection and can navigate to canonical workspace-session URLs. It does not require an active workspace runtime.

**Review gate:** Both clients build in a browser-only environment over fake adapters. Session retarget updates history only after success, and direct URLs restore the same target. Reconnect tests recover all snapshot-backed state without accidentally remounting the whole client.

### H6: Rehome app features and workspace compositions

Move reusable Chat, Canvas, workspace tools, and other app-layer features under `apps/features`. Move the repository dogfood manifest and any workspace-specific source under `apps/workspaces/default`. Preserve direct manifest selection and source readability. Do not introduce global feature discovery.

Update scaffolding and development references so core runtime and hosts can build without importing the reference application. A bare test workspace must activate without Chat, Canvas, or developer tools.

**Review gate:** The default workspace behaves as before through explicit manifest references, while runtime, client, and host package graphs have no dependency on app features.

### H7: Reconstitute Electron as a discrete host

Move Electron main, preload, launcher client bootstrap, native chrome, IPC, protocol, recents, dialogs, and packaging assumptions under `hosts/electron`. The Electron host composes the shared supervisor, runtime, launcher client, and workspace client through concrete adapters.

Bind each workspace window to one attachment rather than broadcasting through `BrowserWindow.getAllWindows()`. IPC requests carry host-stamped attachment context, and runtime events route only to matching windows. Bind Electron resource URLs through workspace-qualified routes. Keep process handlers, raw IPC, protocol registration, and window lifecycle inside the Electron host.

Preserve existing dogfood behavior and add a concurrent-workspace proof with two windows. The launcher client uses the shared launcher presentation where its capabilities overlap and retains Electron-specific folder selection as an honest host capability.

**Review gate:** Electron passes existing behavior checks, and two workspace windows remain isolated despite duplicate feature ids. Session switching moves only the requesting attachment. No Electron import exists in runtime, client, app feature, or shared host-neutral code.

### H8: Build the server host, launcher, and live channel transport

Create the server composition root under `hosts/server`. It starts with zero active workspace runtimes and owns a supervisor. It exposes the launcher catalog, serves canonical routes, and creates one attachment per live connection.

Choose and implement the live transport against the proven attachment boundary. WebSocket remains the expected local choice because the channel surface is bidirectional. The unit must decide against actual operations and scoped delivery rather than inherit the discarded broadcast spike. The transport comparison analysis from the discarded spike remains available as reference in repository history.

The wire protocol uses discriminated request, response, error, and event frames with required correlation fields. Every crossing records through the shared wire-log chokepoint with per-contract redaction, so server lines match Electron lines. The host resolves workspace and initial session from the connection URL. Session switching retargets the existing attachment. Events carry runtime scope and the host delivers them only to matching connections. Pending requests reject as indeterminate after a connection loss. Bounded outbound queues drop slow clients into the snapshot recovery path.

Run one conformance suite against in-memory, Electron, and real server adapters. Include two connections on one session, independent sessions in one workspace, concurrent workspaces, retargeting, malformed frames, request errors, redacted logging, scoped fan-out, disconnect, and reconnect.

**Review gate:** A laptop-style and phone-style client attached to one workspace-session share one live agent and transcript stream. Retargeting either client leaves the other unchanged. No server transport mechanism appears in runtime or feature contracts.

### H9: Add HTTP resource delivery and browser parity

Bind the runtime-owned resource dispatcher to server HTTP. Serve the launcher shell, workspace shell, built surface modules, styles, feature resources, and contained content through workspace-qualified routes. Preserve logical resource identity while allowing Electron custom-protocol and HTTP encodings to differ.

Review Content Security Policy, Cross-Origin Resource Sharing, iframe origins, generated-content containment, path traversal, cache hashes, development asset resolution, and production layout. Direct requests to canonical workspace-session URLs must serve the workspace client, while invalid workspace or session ids return actionable host errors.

Complete browser parity tests for activation, reload, surfaces, Canvas writeback, settings, keybindings, session switching, provider authentication callbacks, persistence, and reconnect recovery.

**Review gate:** An ordinary supported browser can open the launcher and navigate to a workspace-session URL. It can use the reference composition and reload that URL directly. The browser retains the same runtime semantics as Electron.

### H10: Add operational and distribution readiness

Expose the launcher/catalog projection through versioned HTTP and stable CLI JSON. Add server address advertisement for a native launcher. Decide startup URL reporting, loopback bind defaults, port selection, browser opening, logs, signals, stale advertisements, profile locations, and actionable startup failures.

Perform the local-server threat review before allowing non-loopback binding. Define intentional Electron/server differences and run the shared parity matrix on macOS and a Linux or container-like environment. Then complete independent host builds and the Node single executable application packaging pass. Packaging must not pull Electron or app features into the core server artifact.

**Review gate:** The Electron and server hosts build independently over the same runtime and clients. CLI and HTTP launcher projections agree, and server discovery recovers from stale advertisements. The local safety model is documented. The core server distribution contains no Electron or batteries-included app composition.

## Decisions deliberately deferred

- Configurable post-turn warm retention and always-on agent instance policies.
- Host-authored background agent retention and cron orchestration.
- Multiple branch-bound agents on one durable session tree.
- Ephemeral call-and-response agents.
- Remote identity, tenancy, authorization, collaboration, and hosted persistence.
- Non-loopback server operation before a separate security model.
- Fruition onboarding, defaults, subscription UX, installers, updates, and final repository timing.
- Independent publication and versioning of internal packages unless distribution requires it.
- A feature marketplace or hostile-feature sandbox.

## Not in this plan

- Preserving the discarded broadcast transport or global broadcast behavior for compatibility.
- Maintaining parallel old and new runtime or renderer paths.
- Replacing Electron with another desktop shell.
- Building the native launcher UI.
- Building Fruition or hosted Fruition.
- Process-isolated workspace runtimes. Local isolation is in-process lifetime bags, and a hosted deployment isolates users by VM.
- Adding implicit feature discovery or compiled-in default features.

## Completion gate

The split completes when Electron and server are discrete hosts over one workspace-runtime implementation and one shared browser client. A supervisor can run concurrent isolated workspace instances. Connections share and retarget primary agent instances correctly. Launcher clients address canonical workspace-session URLs, and both hosts pass the shared semantic suite. Shipping the server does not imply public API stability beyond UIX's declared maturity.

## Appendix: E0 host-contract inventory

This inventory comes from the discarded transport-first plan (recorded 2026-08-08, see `spike/electron-server-split` in repository history). H3 reuses it as the starting analysis for what moves into `packages/runtime` and what stays host-owned. Unit references are remapped from the old plan's E-units to this plan's H-units. The inventory is historical evidence: it classifies the Electron surface as it existed at that commit, not the current tree.

The Electron surface is six production files. `src/main/index.ts` owns app lifecycle, windows, menu, picker, dialogs, recents, and packaged paths. `src/main/ipc.ts` is the channel transport over `ipcMain`/`webContents`. `src/main/resource-registry.ts` is the `uix-resource` custom protocol. `src/main/lifecycle.ts` provides app/window event helpers. `src/main/external-links.ts` routes window navigation to `shell.openExternal`. `src/preload/index.ts` is the renderer transport client. Everything else in `src/main` is host-neutral fs/path/Pi work.

`openWorkspace()` is already almost entirely runtime. It builds the document store, manifest store, settings, and feature loader. It owns all eight facet registries, the agent driver, the surface pipeline, and the reload coordinator. The `uix`/`agent` channel handlers are runtime too. The host pieces inside it are the window, the menu, the channel transport closures, `openExternal`, `userData` paths, and the templates path.

The smallest host contract is five ports. Each is a concrete effect the runtime already performs:

1. **Channel transport**: `registerHandler(id, handler, logOpts)` plus `publish(channel, payload, logOpts)`. Electron binds IPC today. The server binds a live bus later (H8).
2. **Resource serving**: serve normalized routes on the reserved substrate origin. Electron uses the custom protocol. The server uses HTTP (H9).
3. **Capabilities**: `openExternal(url)`, the Pi profile dir, the templates dir, and the page source (dev URL or packaged files).
4. **Workspace target**: the host picks the workspace. The runtime owns everything workspace-scoped, which is already the `appBag`/`openWorkspace` boundary.
5. **Process lifecycle**: the host starts and stops the process. The runtime owns the workspace-scoped bag and disposes on close.

Ownership calls and unresolved cases:

- Recents and the start picker stay host chrome. The server CLI (H10) takes an explicit target and has no picker.
- The menu reload binding is host chrome. The reload coordinator is runtime. The server needs a page-side or CLI reload trigger.
- `ELECTRON_RENDERER_URL` and `app.isPackaged` are Electron dev assumptions. The server dev story differs (H9).
- Packaged resource paths (preload, renderer html, icon, templates) are Electron packaging specifics. The server has its own layout (H10).
- `apiModuleDir` resolves from `app.getAppPath()`. The server resolves `@uix/api` from its own install (H10 self-resolution).
- `installProcessHandlers` is Node-neutral and stays shared.

Acceptance status: every Electron import has an owner above. The runtime is describable without `Electron.App`, `BrowserWindow`, `ipcMain`, or `protocol`. H3 extracts `openWorkspace` into a runtime constructor taking these ports.
