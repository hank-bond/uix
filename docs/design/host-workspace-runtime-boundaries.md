---
summary: "A host owns process and platform integration and a workspace supervisor, while each workspace runtime owns exactly one workspace and its agent instances. A launcher above all runtimes projects workspaces and sessions, and an app is a host plus an explicit composition."
kind: explanation
status: exploring
---

# Host, workspace runtime, and launcher boundaries

## Current synthesis

A _host_ owns process and platform integration. A _workspace runtime_ owns the substrate semantics for exactly one workspace. A _supervisor_ sits inside the host and maps workspace ids to private `WorkspaceOwnership`s. Each `WorkspaceOwnership` combines the operational `Workspace` with lifecycle authority over one in-process runtime, its host-side event subscription, and every attachment in that parent lifetime. Guards provide callers the operational workspace without that lifecycle authority. The supervisor keeps several runtimes in one process, and each runtime's lifetime bag preserves teardown isolation. Process isolation is not a goal: a hosted deployment isolates users by VM, and local usage has no trust boundary between workspaces.

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

Concurrent acquisitions of one workspace share one runtime boot through single-flight and receive independent `WorkspaceGuard`s. Each guard protects the private `WorkspaceOwnership` and provides its operational `Workspace` value; the ownership capability remains private to the supervisor. A live workspace guard can retain another guard for connection setup, background work, or another asynchronous use. Guard disposal is synchronous and idempotent. At zero guards, the first policy begins workspace teardown. The `WorkspaceSupervisor` owns that policy and observes the private supervised workspace as it stops event delivery, disposes child attachments, and disposes the runtime. Each workspace runtime owns a discrete lifetime bag, feature composition, stores, registries, and one `WorkspaceAgentRuntime`. That agent runtime owns an `AgentInstanceSupervisor` for its keyed instances. Disposing one runtime cannot remove another runtime's channels, resources, features, or process bindings. The current Electron composition keeps workspace runtimes in an `AsyncDisposableBag`. Its `before-quit` coordinator first stops synchronous host bindings, then awaits workspace teardown before resuming Electron shutdown.

The host resolves a connection's workspace id once, acquires a workspace guard from the workspace supervisor, and asks its handle for an attachment to the accepted session target. This creates two parallel supervision levels: the `WorkspaceSupervisor` maps a workspace id to a single-flight runtime boot, and one `AgentInstanceSupervisor` maps an agent target to a single-flight instance creation. The resulting attachment is the connection's bound request capability, so later messages do not traverse either supervisor or repeat workspace or instance resolution. The attachment owns a replaceable instance guard, and operation-specific guards protect asynchronous work after dispatch. [`agent-session-routing.md`](./agent-session-routing.md) owns attachment retargeting, guard lifetimes, and agent-instance teardown.

A physical connection owns both its workspace guard and its attachment. Host-authored work such as a scheduled job owns a workspace guard without fabricating a connection, then acquires any agent instance guards it needs. Hosts own physical connections, URL routing, origin and authentication policy, native capabilities, and process lifecycle. A host treats each canonical channel payload as opaque and asks its bound attachment to prepare a dispatch. The attachment contributes trusted current authority and an operation guard. The runtime's one channel table contributes the handler, schemas, and contract-owned log policy. The host records the inbound crossing with that prepared policy, invokes the handler, records the result, and sends the response frame. Retarget cannot move an accepted request to another instance, and log policy remains workspace-channel state rather than attachment state. Runtime events name a workspace or durable-session delivery scope, and the supervised workspace delivers them only to matching attachments for host transport. Feature channel contracts do not contain transport, tenancy, or connection-routing fields.

`Attachment` is one runtime-created object and the only domain attachment. It owns identity, current target guard, dispatch, retargeting, event listeners, and disposal. Attachment creation also gives the private supervised workspace a narrow delivery closure. The supervised workspace keeps that closure, selects matching attachments from runtime event scope, and invokes delivery. Callers receive only the attachment. The runtime therefore owns request authority and guard mechanics, while the host owns receiver selection and physical transport without a second attachment object.

The runtime declares its platform dependencies, and the host provides them. Resource delivery, `openExternal`, the Pi app data directory, and the API module directory are dependencies from the runtime's perspective. Canonical channel traffic no longer enters through an injected transport registrar: hosts bind physical connections to attachments and subscribe to scoped runtime events. Unknown canonical channels prepare an explicit error with a safe log policy that omits the untrusted payload. An adapter is the translator that binds one communication or platform capability to another.

### Launcher and catalog

The launcher exists before any workspace runtime. It is a host-level catalog and orchestration service rather than a workspace-runtime capability. A host can start with zero loaded workspaces, serve the launcher, and create a workspace runtime only when a connection acquires one.

The launcher projects known workspace ids, names, canonical URLs, server status, and later recent session summaries. It can inspect workspace manifests and session metadata without booting an agent. Shared host-neutral inspection and catalog code remains ordinary library code above the runtime. Electron and server hosts compose that code with different capabilities, such as a native folder picker or a configured server workspace catalog.

The launcher has several adapters over one versioned projection:

- The server exposes an HTTP endpoint for its hosted launcher and native clients.
- The CLI exposes stable JSON for scripts, diagnostics, and a native launcher.
- Electron exposes the same logical operations over its host transport.
- A native launcher discovers the running server's advertised address, queries its catalog, and opens canonical browser URLs.

The host's capability endpoints and the launcher client remain distinct. The endpoints answer which workspaces and sessions a server exposes. The launcher client is one consumer of that projection.

### Browser clients and canonical URLs

The shared browser client has separate launcher and workspace entry surfaces. Each host owns a client bootstrap that constructs the appropriate transport client and mounts the shared surface. Shared client code never detects Electron globals or selects a transport itself.

The server uses stable host-owned workspace ids rather than filesystem paths in URLs. The route model is conceptually:

```text
/                                      launcher
/w/:workspaceId                        resolve a fallback session
/w/:workspaceId/s/:sessionId           canonical workspace-session page
```

A direct request or reload of the canonical URL resolves the workspace runtime, creates an attachment, and attaches it to the named session's primary agent instance. The workspace-only route resolves the most recently modified valid session, or creates one when none exists, and then replaces itself with the canonical workspace-session URL. An ordinary session switch retargets the existing attachment first, then updates browser history after the runtime confirms success. A workspace switch navigates to another workspace URL and rebuilds the client composition because its manifest and surfaces may differ. Browser clients persist no separate last-session preference: each tab's canonical URL is authoritative. Electron instead persists its local windows or tabs and their canonical workspace-session targets in the host profile so reopening the application restores the local chrome the user closed.

### Repository ownership

The repository makes hosts, reusable substrate packages, and app compositions distinct from the start:

```text
packages/
  api/                 feature-author contracts
  runtime/             one-workspace substrate and agent instances
  client/              launcher and workspace browser clients
  host/                shared supervision and launcher/catalog contracts

hosts/
  electron/            Electron main, preload, native chrome, and bootstraps
  server/              HTTP, live transport, process lifecycle, and bootstraps

apps/
  features/            reusable app-layer feature implementations
  workspaces/
    default/
      uix.workspace.json
      features/        workspace-specific feature implementations
```

An app is a distributable host plus an explicit workspace and feature composition. A host is infrastructure and does not become an app merely because it can display the launcher or workspace client. Entries under `apps/features` are reusable source catalogs, not globally discovered features. Every workspace manifest continues to select its feature entries explicitly.

The dependency direction is one-way. Runtime, client, and feature implementations depend on author contracts. Hosts compose runtime and client. Workspace manifests select shared or local feature entries. Runtime and client packages never import either host, and feature implementations never import runtime or host internals. Shared host coordination lives in `packages/host`: the workspace supervisor, workspace and attachment handles, and the machine-readable launcher/catalog projection schemas. The feature-author API never includes host operations, and the launcher/catalog schemas never live inside a workspace runtime because the launcher exists above every runtime.

## Open questions

- Which workspace registration operations belong in the first server launcher rather than the later native launcher?
- Does the first server process expose one configured workspace catalog or aggregate several configured roots?

## Log

### 2026-08-09: The workspace substrate moves into the runtime package

Moved the Electron-free backend substrate out of `src/main` into `packages/runtime`: documents, manifest store, workspace settings, settings registry, channel registry, resource registry, turn state, the agent tool/prompt/skill/context registries, feature loading, the surface registry and pipeline, the selected-session agent driver, keybindings, and the reload coordinator. `createWorkspaceRuntime` now composes the whole substrate behind the `WorkspaceRuntime` contract over host-provided ports: the channel transport, the resource transport, `openExternal`, the Pi app data directory, and the API module directory. The channel registry holds the canonical table that both the host transport binding and the attachment dispatch path route through, and `dispatch(context, request)` receives host-stamped attachment context outside feature payloads.

The Electron app remains a concrete host in `src/main`: `openWorkspace` constructs one runtime over Electron ports and keeps windows, the menu, the picker, recents, and the reload IPC channel. No Electron import exists in the runtime package, and `hosts/electron` remains an empty root. The runtime isolation suite proves two concurrent workspaces with duplicate feature, channel, resource, and settings ids, exercising activation, settings, documents, dispatch, resources, surfaces, independent reload, scoped events, and disposal isolation.

### 2026-08-09: hosts supervise one-workspace runtimes

Reframed the Electron and server split around hosts rather than treating server transport as a later adapter beside Electron-owned source. Electron and server become discrete composition roots immediately. The shared browser workspace moves out of Electron ownership, and each host supplies a client bootstrap. Delaying this structure was rejected because it lets transport mechanisms choose runtime contracts before host and client responsibilities are clear.

Kept `WorkspaceRuntime` as an exactly-one-workspace boundary. A multi-workspace `Runtime` container was rejected because process placement, runtime boot coalescing, and workspace teardown are host policies. A reusable supervisor provides those policies above the runtime and can return either local handles or proxy handles. The same-process form shares code and process services while each runtime's lifetime bag preserves workspace teardown isolation.

Placed the launcher above all workspace runtimes. The server can serve `/` with no workspace loaded, while Electron, HTTP, CLI JSON, and a native launcher consume one launcher/catalog projection through different adapters. Canonical workspace-session URLs support direct reload and sharing. Session switches retarget a live attachment before updating browser history, while workspace switches rebuild the client composition.

Separated hosts from apps in the repository model. Hosts provide infrastructure. Apps combine a host with explicit feature and workspace compositions. Reusable app features can live under `apps/features`, and workspace-specific features can live beside each manifest without introducing auto-discovery.

Settled the injected-effects vocabulary as `dependencies`, the runtime's operational host surface as `Workspace`, and the external macOS client as the `native launcher` consuming host capability endpoints. The server advertises its address and the native launcher discovers it.

### 2026-08-09: process isolation dropped; the runtime is in-process by construction

Removed the proxy handle and process isolation from the host model. Local usage has no trust boundary between workspaces, so lifetime-bag isolation inside one process is the whole isolation story. A hosted deployment isolates users by VM, which needs no cross-process runtime protocol. The workspace boot factory remains the composition seam, and the runtime contract stays runtime-shaped.

### 2026-08-09: Ownership roots and the package graph land

Established the target ownership roots with package metadata and enforced the dependency graph before code moves. `packages/runtime`, `packages/client`, and `packages/host` exist as empty source-only packages; `hosts/electron` and `hosts/server` exist as empty composition roots; `apps/features` and `apps/workspaces` exist as explicit composition catalogs. Shared host coordination earns `packages/host` — the workspace supervisor, workspace handles, and the machine-readable launcher/catalog projection schemas — keeping host operations out of the feature-author API and out of every workspace runtime. ESLint now enforces the one-way import graph per ownership root, with a vitest suite proving each boundary fires.

### 2026-08-13: handles narrow authority and attachments route requests

Separated the operational `Workspace` surface from the `WorkspaceOwnership` lifecycle authority retained by the supervisor. The ownership capability combines that operational surface with authority over event routing, child attachments, and teardown. Guards provide the workspace operations without exposing disposal. Workspace resolution occurs once at connection setup. Every later canonical request travels directly through the connection's bound attachment into the runtime channel table rather than using the supervisor as a multi-workspace request router.

Settled session restoration by host shape. Browser tabs use only canonical workspace-session URLs. A workspace-only URL resolves the newest valid session and then becomes the canonical workspace-session URL. Electron persists each local window or tab's canonical target in its own host profile.

### 2026-08-14: supervision repeats at the agent-instance level

Generalized supervision as keyed child lifecycle ownership rather than a host-only role. The host's `WorkspaceSupervisor` owns workspace runtime boot and teardown. Each `WorkspaceAgentRuntime` owns an `AgentInstanceSupervisor` that provides single-flight instance boot, disposable guards, lifetime policy, and teardown without joining the ordinary request hot path.

### 2026-08-14: one attachment and a narrow delivery closure

Removed the proposed host façade over a second runtime attachment object. The runtime creates one `Attachment` with request authority, target guards, event observation, and disposal. Creation privately provides the supervised workspace a delivery closure. The host still selects receivers and sends transport frames, but no wrapper duplicates attachment identity, target, or lifetime.

### 2026-08-14: prepared dispatch keeps static policy at workspace scope

Placed handler schemas and wire-log policy on the canonical workspace channel entry. The attachment contributes only its accepted authority and a retained operation guard. A short-lived `PreparedDispatch` joins those inputs so the host can record the crossing before invocation without copying a channel catalog or assigning workspace policy to each attachment.

### 2026-08-15: workspace supervision adopts guards

Made guards the project pattern for independently retained shared live objects. `WorkspaceSupervisor.acquire()` returns an independent `WorkspaceGuard`, which protects the private `WorkspaceOwnership` and provides its operational `Workspace` value. Connections and host-authored jobs dispose their own guards without affecting peers. Zero guards admits workspace teardown policy, while asynchronous supervisor disposal stops admission, drains guards, and awaits actual runtime teardown.
