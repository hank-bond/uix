---
summary: "Build explicit Electron and server hosts around a shared browser client, host-side workspace supervisor, and exactly-one-workspace runtime instances. Prove concurrent workspace and agent-instance isolation before migrating hosts, then add launcher, live transport, HTTP resources, and distribution readiness."
---

# Electron and server hosts

## Unit status

- **H0** baseline established (commit before H1).
- **H1** ownership roots and dependency enforcement landed.
- **H2** in-memory host/runtime boundary proof landed.
- **H3** real workspace runtime landed. The openWorkspace substrate moved into `packages/runtime`. `createWorkspaceRuntime` composes it over host ports, and the Electron app consumes it without host migration. The H3 isolation suite proves two concurrent workspaces with duplicate feature, channel, resource, and settings ids.
- **H4.0** derisk spike landed: two real Pi runtimes coexist in one process, and two live agents append disjoint branches to one session file. See the H4 section.
- **H4.1** in progress. Per-instance transcript identity, mutable state, branch-local model selection, explicit manager opening, forward `SessionTarget` identity, and the internal `AgentInstance` owner have landed. H4 still ships one primary branch per session. The deferred multi-branch architecture is recorded below.

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
- **Hosts route, runtimes dispatch.** A host resolves the workspace and owns physical connection context. It passes the connection's `SessionTarget` through unchanged and binds the returned runtime attachment to that connection. The runtime resolves an omitted `branchId`, acquires or boots the corresponding agent, validates canonical channel requests, and emits explicitly scoped events. Feature payloads contain no transport or tenancy fields.
- **No global broadcast semantics.** H4 routes workspace and session events only to matching attachments. Explicit agent-instance identity and event scope wait for a concrete ephemeral-execution or stale-work requirement. A transport can optimize subscription mechanics without redefining delivery scope.
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
- Workspace and session event scopes. Explicit agent-instance scope is deferred until it has a concrete consumer.
- Workspace and attachment retention with deterministic disposal.
- A host-facing `WorkspaceHandle` type with one implementation.

Use fake runtimes and agents. Avoid Electron, WebSocket, HTTP, Pi, and feature loading. The scenarios should prove two workspaces with identical canonical ids, several attachments on one session, independent retargeting, scoped event delivery, failed-target rollback, and disposal isolation.

**Review gate:** The in-memory scenarios read as the architecture described in the design notes. No contract assumes one global selected session or transport-wide broadcast, and runtime isolation is in-process through lifetime bags.

### H3: Prove concurrent real workspace runtimes

_Status: landed._ The openWorkspace substrate moved into `packages/runtime` behind `createWorkspaceRuntime`. It covers documents, manifest store, workspace settings, the settings and channel registries, the resource registry, turn state, agent registries, feature loading, surfaces, and reload. Dispatch is runtime-owned canonical. `src/main` now constructs one runtime over Electron ports and keeps only host chrome. The `runtime.test.ts` suite instantiates two real workspaces with duplicate ids and exercises activation, settings, documents, dispatch, resources, surfaces, reload, events, and disposal.

Move enough backend substrate into `packages/runtime` to implement a real `WorkspaceHandle` for exactly one workspace. Replace host handler registration with runtime-owned canonical dispatch. Keep channel and resource registries local to the runtime instance, and pass host-stamped attachment context into dispatch outside feature payloads. The E0 inventory in the appendix (from the discarded plan) already classified the Electron surface into runtime semantics and host behavior. Reuse it as the starting analysis.

Instantiate two real workspaces in one process with overlapping feature, channel, resource, and settings ids. Exercise feature activation, settings, document storage, surface registration, reload, and disposal. Process-global services must be host-owned or explicitly shared. Mutable workspace state cannot remain in module singletons.

Do not migrate Electron yet. Use in-memory host and resource adapters so failures reveal runtime isolation rather than platform behavior.

**Review gate:** Both workspaces run concurrently, reload independently, and retain duplicate local ids. Disposing either runtime removes only its state and routes. If the current lifetime bags do not form a complete workspace boundary, stop and revise the runtime composition before continuing.

### H4: Prove real agent instances

Restructured into sub-units after the H4.0 derisk findings. The gate question (whether Pi and feature state can support concurrent in-process instances) has a preliminary **Pi passes** answer. The state-model risk is UIX-owned: the per-instance refactor, the instance manager, and the feature instance boundary.

#### H4.0: Derisk spike: Pi concurrency and shared-file branch writes

_Status: landed._ Two spike suites prove the load-bearing assumptions with real Pi:

- `packages/runtime/src/agent/pi-concurrency-spike.test.ts`: two real `AgentSessionRuntime`s share one process with distinct services and modelRuntime. UIX extension hooks bind per runtime: a `model_select` mirror on one runtime never fires for the other. The suite covers concurrent model-store refresh on the shared profile, dispose isolation, and independent real turns. Env-gated: skips without the userspace profile (`UIX_PI_AGENT_DIR`), prompts only with `UIX_SPIKE_PROMPT=1`.
- `packages/runtime/src/agent/same-session-branches.test.ts`: two managers, and two real live agents, append disjoint branches to one session file concurrently without corruption. A fresh open sees the full tree, and each writer's stale view sees only its own branch. The append-level test runs always (no profile, no tokens).

Findings that shape the design:

- Appends are single-line O_APPEND writes, atomic per row. No file lock is needed in-process.
- Compaction is a pure append that writes a `compaction` entry. Old rows stay in the file, and only context projection skips them. It never rewrites the file.
- The only full-file rewrites are open-time: empty-file header init, session schema version migration, and new-file creation. Migration runs at most once per session file ever and is first-writer-safe. It is a boot rule, not a join rule.
- Multi-process is a non-goal. No cross-process writer topology exists, so the lock story is closed.

#### H4.1: Per-instance agent owner (behavior-preserving refactor)

Extract the driver's instance-scoped state into an `AgentInstance`. Each instance owns one independent `SessionManager`, one `AgentSessionRuntime`, one transcript binding, one turn-state coordinator, one ephemeral transcript-id sequence, and one `currentModel`. It has one immutable primary session target and no `switchSession` method. Workspace-level services such as provider auth, the model catalog, workspace settings, and session-file discovery stay shared.

H4 deliberately supports **one primary branch per session**. `SessionTarget = { sessionId, branchId? }` reserves the eventual durable branch identity. `branchId` is the first row born on a branch. H4 accepts only the primary target with `branchId` omitted. It does not walk branch trees, expose fork selection, or silently ignore a supplied branch id. A branch-bearing target is unsupported until the deferred session coordinator exists.

Module-level mutable state must not leak across instances. In particular, the ephemeral live-item id sequence is instance-scoped. `selectModel` stops writing the workspace default. The chat picker records native Pi `model_change` state on the primary branch. The static workspace default remains a fallback for a branch with no model history. A separate settings path for changing that default is deferred. The reference manifest default remains `deepseek/deepseek-v4-flash`.

**Review gate:** Existing driver tests stay green. New tests prove two instances do not share the ephemeral sequence, turn-state coordinator, transcript binding, or `currentModel`. The current single-session Electron behavior is unchanged, and no H4 path claims multi-branch behavior.

#### H4.2: Instance manager lifecycle

The manager composes `AgentInstance` objects under the first shipping policy of one primary instance per session. It owns attach, single-flight boot, warm attach, retention refcount, and acquire-before-release retarget. Teardown policies cover idle immediate, running at a safe turn boundary, and cancel-on-attach. It enforces one active turn per primary instance with busy rejection, and failed acquisition preserves the old instance.

The live ownership map is keyed by session id in H4. Several attachments to the same session retain and share one instance, which is the multi-device behavior the first server needs. The manager uses object identity for its lifecycle races. H4 does not mint or expose an instance id without a concrete stale-work consumer. Applications address the durable session, not the ephemeral execution.

**Review gate:** The lifecycle scenario list below, minus Canvas and future branch items, passes against the mocked SDK with two sessions in one runtime.

#### H4.3: Feature instance boundary

Split workspace-scoped feature ownership from primary-session working state: turn-state cells and agent-context buffers become per instance. The Canvas document buffer is the proving feature. Existing contribution APIs may need an instance-instantiation or context-aware callback boundary. Prove that boundary with real stateful features rather than sharing singleton closures across sessions.

This unit establishes the branch-viewpoint ownership grain without implementing several branches in one session. Each shipping instance still owns the only primary viewpoint for its session.

**Review gate:** Two sessions retain independent Canvas documents, anchors, turn state, and agent context.

#### H4.4: Session-scoped events and reload reconciliation

Application routing uses workspace and session scope. An attachment's accepted URL and host authorization establish its workspace and session subscription. The host stamps that context. Payload fields cannot widen it. Agent activity for the primary branch reaches every authorized attachment viewing that session. H4 has no explicit instance id or agent-instance event scope.

Preserve the current single-branch Chat behavior in H4, including its live transcript updates. The future all-branch feed described below is a session-scoped durable completed-entry stream, not a reason to implement branch topology or broadcast every token delta now.

Workspace feature reload commits and reconciles every live instance without cross-session state exchange.

**Review gate:** Session scope isolation and reload reconciliation pass against fake hosts in the H3 style. A client cannot spoof another workspace or session through a feature payload.

#### H4.5: Real-Pi gate and model semantics

Graduate the H4.0 spikes into the plan's review gate, and land per-instance `currentModel` projection with the workspace default as fallback.

The lifecycle contract across H4.1–H4.5, implemented and tested:

- Concurrent cold attachments awaiting one single-flight boot promise.
- Warm attachment to an existing primary instance.
- Two live agents on distinct sessions in one workspace runtime.
- Acquire-before-release attachment retargeting.
- Failed target acquisition preserving the accepted old instance.
- One active turn per primary instance, with a clear busy rejection for competing prompts.
- Immediate teardown of a zero-attachment idle instance.
- Teardown of a zero-attachment running instance after its safe turn boundary.
- A new attachment canceling pending teardown.
- Session-scoped agent events reaching every authorized attachment on that session.
- Two sessions retaining independent restored Canvas documents, anchors, turn state, and agent context.
- One attachment leaving a shared instance without committing, restoring, or disrupting peers.
- Final state commit and safe teardown only when the agent instance tears down.
- Workspace feature reload committing and reconciling every agent instance without cross-session state exchange.

Retained as later policies: configurable warm retention, always-on instances, host-authored retention, static-default model setting, and the multi-branch architecture below.

**Review gate:** Real Pi sessions and stateful features satisfy the lifecycle above without process-global collisions, cross-session event leakage, or shared primary-session state mutation. If Pi or feature state cannot support concurrent in-process instances, stop and revisit the state model. Neither host should depend on the shape first.

#### Deferred: multi-branch session coordination

This is an architectural constraint on H4, not an H4 deliverable. Do not partially implement it through local branch-end walks or by treating the file's last row as every manager's target.

A later branch/multi-agent unit introduces one session coordinator per active durable session:

```text
Session coordinator
├── shared graph index and branch catalog
│   ├── entry id → durable entry and branch id
│   └── branch id → mutable current head id
├── session-scoped completed-entry publisher
└── exclusive branch leases
    ├── branch A → AgentInstance A → private SessionManager A
    └── branch B → AgentInstance B → private SessionManager B
```

The settled future responsibilities are:

- **Stable identity and mutable position:** `branchId` is the first durable row on a branch and keys the exclusive lease. `headId` advances on every append and positions a newly booted manager. The application never uses a mutable head as branch identity.
- **One manager per agent:** every branch-bound `AgentInstance` owns an independent Pi `SessionManager` because its leaf pointer is mutable. The coordinator supplies the resolved head. Instances do not discover branch ends independently.
- **One graph derivation on cold open:** scan the session entries once to derive complete topology, `entryId → branchId`, and `branchId → headId`. A persisted head index may later accelerate this. It remains rebuildable cache, and the append-only session file stays authoritative.
- **Incremental graph updates:** instrument each private manager's durable append boundary. After Pi appends and returns an entry id, UIX reads and ingests the entry. It then advances that branch's head and publishes a session-scoped completed-entry event.
- **Session visibility, agent isolation:** authorized viewers of a session receive its graph snapshot and completed durable entries for every branch. Agents retain only their private branch context. Cross-branch agent communication or synthesis requires a future explicit mechanism and is not implied by graph visibility.
- **Application routing by branch, not instance:** future clients may hold handles to several branches and prompt their exclusive agents independently. Internal instance ids or generations may reject stale work, but have no URL, UI, or event-routing meaning.
- **Host-stamped subscriptions:** the accepted connection URL and authorization establish the session subscription. The host passes its `SessionTarget` to the runtime unchanged. It does not inspect the session graph or resolve a missing `branchId`. The session coordinator applies the default-branch policy and returns an opaque attachment for the host to bind to the connection. Runtime envelopes qualify completed entries with session and branch identity outside feature-authored payloads. A client cannot spoof another session by placing routing fields in a request.
- **Unborn branch:** a provisional internal lease rekeys once when its first durable append supplies the branch id. No marker row or minted durable token is added solely for UIX.

The first branch UI consumes the coordinator's branch catalog. It renders human-facing previews, fork points, timestamps, or user labels. Raw branch ids remain machine identity. Token deltas may later use an explicit live-branch subscription. The all-branch session feed needs only completed durable entries.

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

Bind each workspace window to one attachment rather than broadcasting through `BrowserWindow.getAllWindows()`. IPC requests carry host-stamped attachment context, and runtime events route only to matching windows.

Bind Electron resource URLs through workspace-qualified routes. Today each runtime binds `protocol.handle` on the substrate scheme directly, so a second runtime would silently replace the first's handler. The host owns one registration and routes workspace-qualified URLs into each runtime's dispatcher. Make host shutdown await workspace runtime disposal. The current sync bag shim fires async teardown without awaiting. Keep process handlers, raw IPC, protocol registration, and window lifecycle inside the Electron host.

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
- Ephemeral call-and-response agents, including any explicit agent-instance identity and event scope that their routing requires.
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
