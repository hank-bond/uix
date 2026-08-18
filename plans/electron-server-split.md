---
summary: "Build minimal Electron and loopback server hosts over the proved workspace runtime, attachment boundary, supervisor, and shared browser client."
---

# Electron and server hosts

## Unit status

- **H0** baseline established (commit before H1).
- **H1** ownership roots and dependency enforcement landed.
- **H2** in-memory host/runtime boundary proof landed.
- **H3** real workspace runtime landed. The openWorkspace substrate moved into `packages/runtime`. `createWorkspaceRuntime` composes it over host ports, and the Electron app consumes it without host migration. The H3 isolation suite proves two concurrent workspaces with duplicate feature, channel, resource, and settings ids.
- **H4.0** derisk spike landed: two real Pi runtimes coexist in one process, and two live agents append disjoint branches to one session file. See the H4 section.
- **H4.1** owner primitives landed. Per-instance transcript identity, mutable state, branch-local model selection, explicit manager opening, forward `SessionTarget` identity, and the internal `AgentInstance` owner are present. Production driver retirement moves into H4.2 so the branch does not build a temporary singleton coordinator only to remove it.
- **H4.2** landed. It activates session-keyed instance supervision, guard-native lifetimes, attachment dispatch, non-blocking retarget, and teardown policy. UIX-owned lifecycle capabilities now use the ECMAScript disposal protocols without parallel named cleanup operations. The deferred multi-branch architecture moved to the Agent feature plan.
- **H4.2a** active-turn cancellation landed. Remaining operation hardening moved to [`runtime-operation-hardening.md`](./runtime-operation-hardening.md).
- **Further Agent runtime work** moved to [`agent-feature-instances-and-viewpoint-state.md`](./agent-feature-instances-and-viewpoint-state.md).
- **H5.1** launcher extraction landed in `0e2ccdc`.
- **H5.2** workspace extraction is in review. H5.3 follows with the browser-only boundary proof.
- **H6-H8** add the minimal loopback server, rehome Electron, and prove basic two-host conformance.

## Status and intent

This plan replaces the earlier transport-first Electron/server split. The discarded spike proved that Electron-independent runtime code and a WebSocket adapter are possible. It also let Electron's global handler and broadcast model shape the transport boundary before host, workspace, attachment, and client ownership were clear. The rebuilt path treats that work as evidence rather than an implementation base.

The highest-risk questions land first as executable architecture:

1. Can two real workspace runtimes with duplicate feature, channel, and resource ids coexist and dispose independently in one process?
2. Can one workspace runtime supervise concurrent real Pi agents on separate sessions with single-flight instance creation, explicit lifetime guards, retargeting, and safe teardown?
3. Can one attachment and scoped dispatch boundary support in-memory tests, Electron IPC, and WebSocket connections without feature contracts learning transport fields?

Broad source movement and host implementation follow only after those gates pass. A failed gate pauses the plan and reopens the design rather than adding compatibility around a wrong boundary.

The plan implements the synthesis in [`host-workspace-runtime-boundaries.md`](../docs/design/host-workspace-runtime-boundaries.md), [`agent-session-routing.md`](../docs/design/agent-session-routing.md), [`agent-instance-state.md`](../docs/design/agent-instance-state.md), [`product-and-distribution.md`](../docs/design/product-and-distribution.md), and [`workspace-feature-composition.md`](../docs/design/workspace-feature-composition.md). It retains the decisions that features are the loadable unit, manifests are the composition authority, surface delivery is runtime-built, and designs remain hosting-compatible. Implementation follows the [`human-paced-implementation.md`](../docs/architecture/human-paced-implementation.md) loop: complete one review unit, explain it, and wait for approval.

## Target topology

```text
Host process
├── launcher and workspace catalog
├── WorkspaceSupervisor
│   ├── supervised workspace A
│   │   ├── WorkspaceGuard(s) → Workspace
│   │   └── WorkspaceRuntime
│   │       └── WorkspaceAgentRuntime
│   │           └── AgentInstanceSupervisor
│   └── supervised workspace B
│       ├── WorkspaceGuard(s) → Workspace
│       └── WorkspaceRuntime
│           └── WorkspaceAgentRuntime
│               └── AgentInstanceSupervisor
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
- **Supervisors own keyed child lifecycles.** The host's `WorkspaceSupervisor` owns workspace identity, single-flight runtime boot, workspace guard admission, lifetime policy, and teardown. It privately retains each `WorkspaceOwnership` and issues independent `WorkspaceGuard`s that provide its operational `Workspace` value without teardown authority. Each `WorkspaceAgentRuntime` similarly owns an `AgentInstanceSupervisor` without placing either supervisor on the ordinary request hot path.
- **Guards make agent-instance use explicit.** One primary instance per session is the first policy. The instance supervisor owns single-flight creation, guard admission, lifetime policy, and teardown. Attachments, accepted requests, running turns, reload, and background work hold disposable `AgentInstanceGuard`s for their complete asynchronous use. Disposing a guard is immediate and removes one teardown veto. It does not request cancellation. Potentially unbounded operations separately carry an owner-controlled cancellation signal and a completion boundary so parent disposal can request quiescence before waiting for guards. Zero guards permits policy but does not promise disposal. An instance owns its private session manager and restored state immediately, then boots its one Pi runtime lazily.
- **Hosts route, runtimes dispatch.** A host resolves the workspace once and owns physical connection context. It acquires one workspace guard and passes the connection's `SessionTarget` through unchanged. The guard's operational `Workspace` value creates one runtime attachment, and the host binds both capabilities to the connection. The attachment owns request authority, target guards, event observation, and disposal. Its private supervised workspace holds only the delivery closure returned at creation, selects matching receivers, and sends through host transport. Each later canonical request asks the attachment to prepare one dispatch directly. The runtime resolves an omitted `branchId`, then acquires or creates the corresponding agent instance. One canonical channel table and handler model route the request and validate its request and response. Feature payloads contain no transport or tenancy fields.
- **No global broadcast semantics.** H4 routes workspace and session events only to matching attachments. Explicit agent-instance identity and event scope wait for a concrete ephemeral-execution or stale-work requirement. A transport can optimize subscription mechanics without redefining delivery scope.
- **One wire-log boundary.** Every channel crossing records through one chokepoint with per-contract redaction. The log can be neither dodged nor spoofed, and crossing lines stay identical across hosts.
- **The launcher precedes all runtimes.** A host can serve workspace catalogs with zero active workspaces. Launcher HTTP, CLI JSON, Electron, and native clients consume one machine-readable projection.
- **The browser client is host-neutral.** Shared launcher and workspace clients receive constructed adapters. They do not inspect Electron globals or select transports.
- **Resources have one logical dispatcher.** Electron protocols and server HTTP encode workspace-qualified routes over the same runtime-owned resource semantics.
- **Apps are explicit compositions.** Hosts do not silently install app features. Shared and workspace-local features remain explicit manifest references.
- **Lifetimes compose.** The host owns physical connections. The workspace supervisor owns each supervised workspace and its runtime teardown. Each connection owns an independent workspace guard and one attachment. The guard provides an operational `Workspace` value that exposes attachment creation without disposal. Each attachment owns a replaceable target guard, and detached operations own independent guards. The supervised workspace remains the parent lifetime. The runtime owns active feature composition, while its agent instance supervisor remains the sole owner of agent instances.

## Review units

### H0: Discard the spike and establish the baseline

Begin implementation from the mainline behavior plus approved design, naming, and documentation changes. Do not migrate the unlanded transport-first runtime and WebSocket implementation forward. Preserve it only as a test and design reference. Re-adopt an independently useful change, such as the local `@uix/api` package, only when it fits the target dependency graph without upward imports.

Record the baseline Electron behavior and checks that later units must preserve. Remove or defer any unlanded decision whose conclusion depended on global broadcast or the old broadcast transport. Decide the fate of the two naming and lexicon commits that are not on main. Replay them after H1 establishes the target roots, or revalidate the vocabulary rules under main's configuration. A WebSocket choice may be recorded again after the scoped dispatch boundary proves it.

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

- A supervisor acquiring an independent workspace guard through a single-flight boot promise.
- The guard providing an operational `Workspace` value that creates an attachment for an initial session target without exposing workspace disposal.
- An attachment dispatching requests and retargeting its session.
- Workspace and session event scopes. Explicit agent-instance scope is deferred until it has a concrete consumer.
- Workspace and attachment lifetimes with deterministic supervisor-owned disposal.
- A host-facing operational `Workspace` type with a private `WorkspaceOwnership` implementation.

Use fake runtimes and agents. Avoid Electron, WebSocket, HTTP, Pi, and feature loading. The scenarios should prove two workspaces with identical canonical ids, several attachments on one session, independent retargeting, scoped event delivery, failed-target rollback, and disposal isolation.

**Review gate:** The in-memory scenarios read as the architecture described in the design notes. No contract assumes one global selected session or transport-wide broadcast, and runtime isolation is in-process through lifetime bags.

### H3: Prove concurrent real workspace runtimes

_Status: landed._ The openWorkspace substrate moved into `packages/runtime` behind `createWorkspaceRuntime`. It covers documents, manifest store, workspace settings, the settings and channel registries, the resource registry, turn state, agent registries, feature loading, surfaces, and reload. Dispatch is runtime-owned canonical. `src/main` now constructs one runtime over Electron ports and keeps only host chrome. The `runtime.test.ts` suite instantiates two real workspaces with duplicate ids and exercises activation, settings, documents, dispatch, resources, surfaces, reload, events, and disposal.

Move enough backend substrate into `packages/runtime` to implement a real operational `Workspace` for exactly one workspace. Replace host handler registration with runtime-owned canonical dispatch. Keep channel and resource registries local to the runtime instance, and pass host-stamped attachment context into dispatch outside feature payloads. The E0 inventory in the appendix (from the discarded plan) already classified the Electron surface into runtime semantics and host behavior. Reuse it as the starting analysis.

Instantiate two real workspaces in one process with overlapping feature, channel, resource, and settings ids. Exercise feature activation, settings, document storage, surface registration, reload, and disposal. Process-global services must be host-owned or explicitly shared. Mutable workspace state cannot remain in module singletons.

Do not migrate Electron yet. Use in-memory host and resource adapters so failures reveal runtime isolation rather than platform behavior.

**Review gate:** Both workspaces run concurrently, reload independently, and retain duplicate local ids. Disposing either runtime removes only its state and routes. If the current lifetime bags do not form a complete workspace boundary, stop and revise the runtime composition before continuing.

### H4: Prove real agent instances

Restructured into sub-units after the H4.0 derisk findings. The gate question (whether Pi and feature state can support concurrent in-process instances) has a preliminary **Pi passes** answer. The state-model risk is UIX-owned: the per-instance refactor, the agent instance supervisor, and the feature instance boundary.

#### H4.0: Derisk spike: Pi concurrency and shared-file branch writes

_Status: landed._ Two spikes established the load-bearing assumptions with real Pi:

- A historical, env-gated concurrency spike proved that two real `AgentSessionRuntime`s can share one process with distinct services and model runtimes. UIX extension hooks remained runtime-local, concurrent model-store refresh on one copied profile succeeded, disposal stayed isolated, and opt-in real turns remained independent. The spike served as one-time de-risking evidence and was removed after the ownership model landed. It was not a stable profile-independent regression suite.
- `packages/runtime/src/agent/same-session-branches.test.ts`: two managers, and two real live agents, append disjoint branches to one session file concurrently without corruption. A fresh open sees the full tree, and each writer's stale view sees only its own branch. The append-level test runs always (no profile, no tokens).

Findings that shape the design:

- Appends are single-line O_APPEND writes, atomic per row. No file lock is needed in-process.
- Compaction is a pure append that writes a `compaction` entry. Old rows stay in the file, and only context projection skips them. It never rewrites the file.
- The only full-file rewrites are open-time: empty-file header init, session schema version migration, and new-file creation. Migration runs at most once per session file ever and is first-writer-safe. It is an initial-open rule, not a concurrent-writer rule.
- Multi-process is a non-goal. No cross-process writer topology exists, so the lock story is closed.

#### H4.1: Per-instance agent owner primitives

_Status: landed as owner primitives. Production cutover and driver retirement occur with H4.2 so UIX does not add a temporary singleton coordinator._

Extract the driver's instance-scoped state into an `AgentInstance`. Each instance owns one independent `SessionManager`, one transcript binding, one turn-state coordinator, one ephemeral transcript-id sequence, one `currentModel`, and at most one lazily booted `AgentSessionRuntime`. The instance is the lifecycle owner for one Pi execution and can be session-ready while that runtime remains unbooted. It has one immutable primary session target and no `switchSession` method. Workspace-level services such as provider auth, the model catalog, workspace settings, and session-file discovery stay shared.

H4 deliberately supports **one primary branch per session**. `SessionTarget = { sessionId, branchId? }` reserves the eventual durable branch identity. `branchId` is the first row born on a branch. H4 accepts only the primary target with `branchId` omitted. It does not walk branch trees, expose fork selection, or silently ignore a provided branch id. A branch-bearing target is unsupported until the deferred session coordinator exists.

Module-level mutable state must not leak across instances. In particular, the ephemeral live-item id sequence is instance-scoped. `selectModel` stops writing the workspace default. The chat picker records native Pi `model_change` state on the primary branch. The static workspace default remains a fallback for a branch with no model history. A separate settings path for changing that default is deferred. The reference manifest default remains `deepseek/deepseek-v4-flash`.

**Review gate:** Existing driver tests stay green. New tests prove two instances do not share the ephemeral sequence, turn-state coordinator, transcript binding, or `currentModel`. The current single-session Electron behavior is unchanged, and no H4 path claims multi-branch behavior.

#### H4.2: Guarded instance supervision and production cutover

_Status: landed._ The selected-session driver is retired. The accepted [supervised-child decision](../docs/decisions/2026-08-15-supervisors-own-guarded-children.md) and its [design record](../docs/design/shared-live-object-lifetimes.md) preserve the final ownership model and rejected alternatives. One generic `Guard<Value>` now underlies workspace and agent-instance supervision. Operational `AgentInstance` and `AgentInstanceState` values are separated from their private lifecycle ownership capabilities. Prepared dispatch preserves accepted authority across attachment retarget or closure, and Electron canonical IPC uses the same attachment path. Supervisor visits retain temporary guards internally while exposing only operational instance values. UIX-owned ownership and runtime contracts use symbol-only disposal, and parent teardown awaits guarded children.

Retire the selected-session driver. Each `WorkspaceRuntime` owns one `WorkspaceAgentRuntime`, which composes shared agent services and an `AgentInstanceSupervisor`. The first shipping policy provides one primary `AgentInstance` per session. The supervisor owns keyed identity, single-flight instance creation, guard admission, lifetime policy, and teardown. It issues disposable `AgentInstanceGuard`s but is not on the ordinary prompt or channel-request hot path. One canonical attachment-dispatch path replaces direct transport handler invocation. Remove the runtime's channel transport registrar. Concrete hosts bind physical connections to attachments and subscribe to scoped runtime events. Ordinary feature and substrate agent requests share one registered handler model, while guarded attachment authority remains outside feature payloads. Remove `ContextualChannelRunner`, `registerContextual()`, and the parallel contextual handler map rather than creating a second handler category.

An attachment owns one replaceable target guard. A successful retarget acquires the new guard and swaps it into the attachment. It disposes the old guard synchronously and returns without waiting for an old running turn or its teardown. Failed acquisition preserves the old guard and accepted target. Request acceptance synchronously retains an operation guard and asks the workspace channel table to prepare one dispatch. The channel table provides the resolved handler, schemas, and contract-owned log policy. The attachment provides immutable workspace, session, and agent-instance authority. The resulting `PreparedDispatch` owns the operation guard and can outlive attachment retarget or disposal. Accepted work can request a retarget after attachment closure. It guards the requested instance for that operation without installing a new target guard on the closed attachment. Instance-specific agent operations consume live guards rather than accepting an unprotected instance across package seams.

Every asynchronous instance use holds a guard for its complete duration. A live guard can synchronously retain another independently disposable guard on the same managed record. Retaining after disposal fails. A started turn retains its own guard before detached work begins and disposes it after the final safe boundary. Reload and reconciliation visit instances under temporary guards. Future host-authored background work acquires a guard directly instead of fabricating an attachment. A guard establishes no event subscription. Disposing a guard is immediate, idempotent, and non-blocking. It does not await state commit or instance teardown. Zero guards makes the instance eligible for supervisor policy rather than promising disposal. The first policy starts teardown for an eligible idle instance immediately. Later idle periods and always-on policy do not change guard semantics.

The live ownership map is keyed by session id in H4. Several attachments and operations on the same session hold independent guards on one instance. Its Pi runtime may be unbooted, idle, or running. This is the multi-device behavior the first server needs. The supervisor uses managed-record object identity for acquisition and teardown races. Guard disposal can begin asynchronous teardown, but the supervisor owns and observes that work. Admission either cancels teardown before its point of no return or awaits it and boots a fresh instance. Acquisition and disposal cannot both win the same record. Parent disposal stops admission, disposes owned attachment guards, drains operation guards, and awaits actual child teardown. H4 does not mint or expose an instance id without a concrete stale-work consumer. Internal guard ids and origins may support diagnostics but never become routing identity.

The host receives each physical request frame and asks its bound attachment to prepare the dispatch. It records the inbound crossing with the prepared contract policy, invokes the handler, and records the result before sending the response frame. Physical messaging and wire-log writes remain host-owned. Log policy remains workspace-channel state rather than attachment state. Unknown channels use a fixed safe policy that records their canonical id without their client-authored payload. A prompt handler retains a separate turn guard before the prepared dispatch disposes its operation guard.

H4.2 includes minimum session-scoped agent-event delivery because an old running session must never publish into an attachment that already moved. Remaining authorized attachments on the old session continue receiving its activity. With none, the turn guard lets execution persist without live delivery. Complete event conformance, snapshot recovery, and reload reconciliation remain in later units. The runtime creates one `Attachment` object with identity, target guards, dispatch, retargeting, event listeners, and disposal. Creation privately returns its supervised workspace a narrow delivery closure. The supervised workspace selects receivers from event scope and invokes delivery without gaining request authority. No host façade or second runtime attachment duplicates identity, target, or lifetime.

Migrate the existing selected-driver behavior suite to the replacement owner rather than deleting its behavior coverage. Add explicit scenarios for shared instances with unbooted Pi runtimes and prepared dispatches across concurrent retarget. Prove that prepared dispatches retain operation guards, preserve their accepted authority, and use their channel registration's log policy after the attachment moves. Cover a turn guard surviving disconnect, non-blocking running retarget, returning to the still-running instance, and guarded all-instance visitation. Also cover session event isolation, idempotent guard disposal, zero-guard policy, acquisition during pending teardown, final commit, parent drain, and guard-leak diagnostics. Do not rely on garbage collection for disposal.

**Review gate:** The lifecycle scenario list below, minus Canvas and future branch items, passes against the mocked SDK with two sessions in one runtime. The tests can account for every guard owner and prove that no asynchronous instance operation uses an unguarded raw instance. Current single-window Electron behavior remains intact, while the multi-attachment behaviors are reviewed explicitly.

#### H4.2a: Active-turn cancellation vertical

_Status: the active-turn vertical landed. Remaining operation hardening moved to a dedicated plan._

Commits `773918f`, `385edaf`, and `370003e` added lexical tracked turn operations, targeted Pi abort, shutdown quiescence, discrete activity events, Chat Stop/Escape controls, and late-attachment activity recovery.

Prepared dispatch, provider authentication, model refresh, single-flight boots, and the remaining external-call inventory now live in [runtime operation hardening](./runtime-operation-hardening.md). They remain important production work but no longer block a basic loopback web host.

### Runtime work split from this plan

Agent facet lifecycles, viewpoint-scoped Canvas state, concurrent-session cutover, and reload reconciliation moved to [agent feature instances and viewpoint state](./agent-feature-instances-and-viewpoint-state.md). The initial web host intentionally retains one visible session target per page and blocks session switching while its Agent runs.

Full reconnect recovery, provider-auth browser parity, app-source rehoming, discovery, security review, and packaging moved to [server browser parity and distribution](./server-browser-parity-and-distribution.md).

The deferred multi-branch Agent architecture is recorded in the Agent feature plan. Session-branch Git state remains in [session worktrees and turn checkpoints](./session-worktrees-and-turn-checkpoints.md).

### H5: Extract the shared launcher and workspace clients

Move browser-compatible launcher and workspace UI into `packages/client`. Each entry receives a constructed adapter from its host bootstrap. Remove ambient Electron detection from shared code. Move the page-shared React, TypeBox, and `@uix/api` module mechanism with the workspace client.

Preserve the current single-target product envelope. One page owns one attachment and one selected primary session. Session switching remains unavailable while its Agent runs. The browser needs canonical workspace-session URLs, but reconnect epochs and complete snapshot recovery move to the parity plan.

The workspace mount receives the existing `WorkspaceClient` rather than a second transport abstraction. It may also receive one synchronous, idempotent `synchronizeSessionLocation(sessionId)` callback. Invoke it only after the client establishes an accepted active session, including initial hydration, New Session, and successful switching. Electron omits it. The server uses it to replace the canonical browser URL. It never participates in session mutation or teaches the client how host URLs are encoded.

The launcher consumes a host-neutral adapter over the host-level catalog. Workspace ids remain opaque. Listing and opening are required. Creation is optional so the initial server catalog may be read-only. Host errors reject, while native-dialog cancellation is an ordinary result. The launcher does not require an active workspace runtime.

Implement H5 in three review slices:

1. **H5.1 launcher seam:** land the host-neutral launcher adapter and disposable mount in `@uix/client`, then adapt the current Electron launcher without changing its behavior.
2. **H5.2 workspace seam:** move workspace source and tests behind a disposable mount. Move shared-surface module installation with it. Preserve Electron behavior while adding session-location synchronization.
3. **H5.3 boundary proof:** build both entries in a browser-only environment over fake adapters. Enforce that the client imports no runtime, host, Electron, or app implementation.

**Review gate:** Launcher and workspace clients build in a browser-only environment over fake adapters. Electron behavior remains unchanged, and no shared client code reads Electron globals.

### H6: Build the minimal loopback server host

Create `hosts/server` over the existing workspace supervisor and one-workspace runtime. Bind loopback only. Serve the minimal launcher and canonical workspace-session pages. The first policy admits one live browser attachment per workspace, preventing concurrent tabs from selecting different sessions before viewpoint isolation lands.

Use discriminated request, response, error, and event frames with correlation ids. The accepted URL selects the workspace and initial session. Ordinary frames repeat no routing identity. The host asks its bound attachment to prepare canonical dispatch and routes only matching runtime events.

Bind the runtime resource dispatcher to HTTP in this unit. Serve the workspace shell, surface modules, styles, feature resources, and contained Canvas content through workspace-qualified routes. Preserve logical resource identity while allowing HTTP and Electron protocol encodings to differ.

Support the basic reference flow with an already configured Pi profile. Open a workspace, inspect history, prompt, stream transcript updates, and use current feature surfaces. Allow session switching only while idle. Do not promise running-turn reattachment, background-run presentation, automatic mutation retry, provider-login parity, or multiple visible session targets.

Apply the minimum loopback safety checks for Content Security Policy, iframe origins, path traversal, and resource routing. Broader threat review and non-loopback operation remain deferred.

**Review gate:** One supported browser attachment opens a configured workspace, runs a basic Agent turn, renders the reference surfaces, and serves Canvas resources. A competing workspace attachment fails clearly. No server transport field enters runtime or feature payloads.

### H7: Reconstitute Electron as a discrete host

Move Electron main, preload, launcher bootstrap, native chrome, IPC, protocol, recents, dialogs, and packaging assumptions under `hosts/electron`. Compose the shared supervisor, runtime, launcher client, and workspace client through Electron adapters.

Bind each Electron window to one workspace guard and attachment. Its `webContents` remains the physical connection identity. Replace each runtime's direct protocol registration with one host-owned workspace-qualified dispatcher. Preserve awaited shutdown and current dogfood behavior.

Keep process handlers, raw IPC, protocol registration, and window lifecycle inside the Electron host. No Electron import may exist in runtime, client, app feature, or shared host-neutral code.

**Review gate:** Electron passes existing behavior checks from its discrete composition root. The server and Electron hosts build without importing one another.

### H8: Basic two-host conformance and split gate

Run one semantic suite against in-memory, Electron, and server adapters. Cover one workspace-session attachment, canonical request success and failure, scoped events, resource dispatch, redacted logging, disconnect, and deterministic disposal.

Keep concurrent-session Canvas behavior, complete reconnect recovery, provider authentication, reload parity, and distribution outside this gate. Their dedicated plans build on the same attachment, client-adapter, and resource boundaries.

**Review gate:** Both concrete hosts run one shared workspace client over one runtime implementation. A basic Chat and Canvas flow works in Electron and a loopback browser without host-specific feature contracts.

## Decisions deliberately deferred

- Concurrent session viewpoints and selected-view Canvas isolation, tracked in the Agent feature plan.
- Complete operation cancellation and bounded shutdown, tracked in the hardening plan.
- Reconnect recovery, provider-auth parity, app rehoming, security review, discovery, and packaging, tracked in the parity plan.
- Configurable zero-guard idle periods and always-on Agent policies.
- Host-authored background Agent guards and cron orchestration.
- Named Agents, multiple branch-bound Agents, spawning, and durable mailboxes.
- Ephemeral call-and-response Agents and explicit instance identity.
- Remote identity, tenancy, authorization, collaboration, and hosted persistence.
- Non-loopback operation before a separate security model.
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

The basic split completes when Electron and server are discrete hosts over one workspace runtime and shared browser client. A loopback browser can open one canonical workspace-session page and complete a basic Chat and Canvas flow. Electron preserves current behavior from its own composition root. Both hosts pass the constrained semantic suite without host fields entering feature contracts.

This gate does not claim concurrent session safety, complete reconnect recovery, provider-auth parity, production hardening, or distributable packaging. The linked follow-up plans own those guarantees.

## Appendix: E0 host-contract inventory

This inventory comes from the discarded transport-first plan (recorded 2026-08-08, see `spike/electron-server-split` in repository history). H3 reuses it as the starting analysis for what moves into `packages/runtime` and what stays host-owned. Unit references are remapped from the old plan's E-units to this plan's H-units. The inventory is historical evidence: it classifies the Electron surface as it existed at that commit, not the current tree.

The Electron surface is six production files. `src/main/index.ts` owns app lifecycle, windows, menu, launcher, dialogs, recents, and packaged paths. `src/main/ipc.ts` is the channel transport over `ipcMain`/`webContents`. `src/main/resource-registry.ts` is the `uix-resource` custom protocol. `src/main/lifecycle.ts` provides app/window event helpers. `src/main/external-links.ts` routes window navigation to `shell.openExternal`. `src/preload/index.ts` is the renderer transport client. Everything else in `src/main` is host-neutral fs/path/Pi work.

`openWorkspace()` is already almost entirely runtime. It builds the document store, manifest store, settings, and feature loader. It owns all eight facet registries, the agent driver, the surface pipeline, and the reload coordinator. The `uix`/`agent` channel handlers are runtime too. The host pieces inside it are the window, the menu, the channel transport closures, `openExternal`, `userData` paths, and the templates path.

The smallest host contract is five ports. Each is a concrete effect the runtime already performs:

1. **Channel transport**: `registerHandler(id, handler, logOpts)` plus `publish(channel, payload, logOpts)`. Electron binds IPC today. The server binds a live bus in H6.
2. **Resource serving**: serve normalized routes on the reserved substrate origin. Electron uses the custom protocol. The server uses HTTP in H6.
3. **Capabilities**: `openExternal(url)`, the Pi app data directory, the templates dir, and the page source (dev URL or packaged files).
4. **Workspace target**: the host picks the workspace. The runtime owns everything workspace-scoped, which is already the `appBag`/`openWorkspace` boundary.
5. **Process lifecycle**: the host starts and stops the process. The runtime owns the workspace-scoped bag and disposes on close.

Ownership calls and unresolved cases:

- Recents and the launcher stay host chrome. The minimal server uses its launcher and an explicit configured catalog.
- The menu reload binding is host chrome. The reload coordinator is runtime. Full browser reload UX belongs to the parity plan.
- `ELECTRON_RENDERER_URL` and `app.isPackaged` are Electron dev assumptions. H6 gives the server its own development path.
- Packaged resource paths are Electron-specific. The parity and distribution plan owns final server layout.
- `apiModuleDir` resolves from `app.getAppPath()`. The server uses its own install resolution, hardened before distribution.
- `installProcessHandlers` is Node-neutral and stays shared.

Acceptance status: every Electron import has an owner above. The runtime is describable without `Electron.App`, `BrowserWindow`, `ipcMain`, or `protocol`. H3 extracts `openWorkspace` into a runtime constructor taking these ports.
