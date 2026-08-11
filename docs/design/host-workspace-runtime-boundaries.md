---
summary: "A host owns process and platform integration and a workspace supervisor, while each workspace runtime owns exactly one workspace and its agent instances. A launcher above all runtimes projects workspaces and sessions, and an app is a host plus an explicit composition."
kind: explanation
status: exploring
---

# Host, workspace runtime, and launcher boundaries

## Current synthesis

A _host_ owns process and platform integration. A _workspace runtime_ owns the substrate semantics for exactly one workspace. A _supervisor_ sits inside the host and maps workspace ids to workspace handles. A workspace handle wraps one in-process runtime. The supervisor keeps several runtimes in one process, and each runtime's lifetime bag preserves teardown isolation. Process isolation is not a goal: a hosted deployment isolates users by VM, and local usage has no trust boundary between workspaces.

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

The supervisor coalesces concurrent runtime boots and owns workspace-level retention and teardown policy. Each workspace runtime owns a discrete lifetime bag, feature composition, stores, registries, and agent instance manager. Disposing one runtime cannot remove another runtime's channels, resources, features, or process bindings.

The host resolves a connection's workspace id before it reaches a runtime. The selected workspace runtime creates an attachment that resolves the session and agent instance. This creates two parallel lifetime levels: the supervisor maps a workspace id to a coalesced runtime boot, and one workspace runtime maps an agent target to a single-flight instance boot. [`agent-session-routing.md`](./agent-session-routing.md) owns attachment retargeting and agent-instance teardown.

Hosts own physical connections, URL routing, origin and authentication policy, native capabilities, and process lifecycle. Runtime request dispatch receives host-stamped attachment context outside feature payloads. Runtime events name a workspace, session, or agent-instance delivery scope, and the host delivers them to matching connections. Feature channel contracts do not contain transport, tenancy, or connection-routing fields.

The runtime declares its dependencies, and the host provides them. Channel transport, resource delivery, `openExternal`, the Pi profile directory, and the API module directory are dependencies from the runtime's perspective. An adapter is the translator that binds one communication or platform capability to another.

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

A direct request or reload of the canonical URL resolves the workspace runtime, creates an attachment, and attaches it to the named session's primary agent instance. The workspace-only route resolves the persisted fallback session or the newest session; that choice is launcher convenience rather than a global active session. An ordinary session switch retargets the existing attachment first, then updates browser history after the runtime confirms success. A workspace switch navigates to another workspace URL and rebuilds the client composition because its manifest and surfaces may differ.

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

The dependency direction is one-way: runtime, client, and feature implementations depend on author contracts; hosts compose runtime and client; workspace manifests select shared or local feature entries. Runtime and client packages never import either host, and feature implementations never import runtime or host internals. Shared host coordination lives in `packages/host`: the workspace supervisor, workspace and attachment handles, and the machine-readable launcher/catalog projection schemas. The feature-author API never carries host operations, and the launcher/catalog schemas never live inside a workspace runtime because the launcher exists above every runtime.

## Open questions

- What workspace-level retention and teardown policy should the first supervisor use after the last connection leaves?
- Which workspace registration operations belong in the first server launcher rather than the later native launcher?
- Does the first server process expose one configured workspace catalog or aggregate several configured roots?

## Log

### 2026-08-09: H3 extracts the workspace substrate into the runtime package

Moved the Electron-free backend substrate out of `src/main` into `packages/runtime`: documents, manifest store, workspace settings, settings registry, channel registry, resource registry, turn state, the agent tool/prompt/skill/context registries, feature loading, the surface registry and pipeline, the selected-session agent driver, keybindings, and the reload coordinator. `createWorkspaceRuntime` now composes the whole substrate behind the H2 `WorkspaceRuntime` contract over host-provided ports: the channel transport, the resource transport, `openExternal`, the Pi profile directory, and the API module directory. The channel registry holds the canonical table that both the host transport binding and the attachment dispatch path route through, and `dispatch(context, request)` receives host-stamped attachment context outside feature payloads.

The Electron app remains a concrete host in `src/main`: `openWorkspace` constructs one runtime over Electron ports and keeps windows, the menu, the picker, recents, and the reload IPC channel. No Electron import exists in the runtime package, and `hosts/electron` remains empty until H7 reconstitutes the host. The H3 isolation suite proves two concurrent workspaces with duplicate feature, channel, resource, and settings ids, exercising activation, settings, documents, dispatch, resources, surfaces, independent reload, scoped events, and disposal isolation.

### 2026-08-09: hosts supervise one-workspace runtimes

Reframed the Electron and server split around hosts rather than treating server transport as a later adapter beside Electron-owned source. Electron and server become discrete composition roots immediately. The shared browser workspace moves out of Electron ownership, and each host supplies a client bootstrap. Delaying this structure was rejected because it lets transport mechanisms choose runtime contracts before host and client responsibilities are clear.

Kept `WorkspaceRuntime` as an exactly-one-workspace boundary. A multi-workspace `Runtime` container was rejected because process placement, runtime boot coalescing, and workspace teardown are host policies. A reusable supervisor provides those policies above the runtime and can return either local handles or proxy handles. The same-process form shares code and process services while each runtime's lifetime bag preserves workspace teardown isolation.

Placed the launcher above all workspace runtimes. The server can serve `/` with no workspace loaded, while Electron, HTTP, CLI JSON, and a native launcher consume one launcher/catalog projection through different adapters. Canonical workspace-session URLs support direct reload and sharing. Session switches retarget a live attachment before updating browser history, while workspace switches rebuild the client composition.

Separated hosts from apps in the repository model. Hosts provide infrastructure. Apps combine a host with explicit feature and workspace compositions. Reusable app features can live under `apps/features`, and workspace-specific features can live beside each manifest without introducing auto-discovery.

Settled the injected-effects vocabulary as `dependencies`, the runtime handle as `WorkspaceHandle`, and the external macOS client as the `native launcher` consuming host capability endpoints. The server advertises its address and the native launcher discovers it.

### 2026-08-09: process isolation dropped; the runtime is in-process by construction

Removed the proxy handle and process isolation from the host model. Local usage has no trust boundary between workspaces, so lifetime-bag isolation inside one process is the whole isolation story. A hosted deployment isolates users by VM, which needs no cross-process runtime protocol. The workspace boot factory remains the composition seam, and the runtime contract stays runtime-shaped.

### 2026-08-09: H1 creates the ownership roots and package graph

Established the target ownership roots with package metadata and enforced the dependency graph before code moves. `packages/runtime`, `packages/client`, and `packages/host` exist as empty source-only packages; `hosts/electron` and `hosts/server` exist as empty composition roots; `apps/features` and `apps/workspaces` exist as explicit composition catalogs. Shared host coordination earns `packages/host` — the workspace supervisor, workspace handles, and the machine-readable launcher/catalog projection schemas — keeping host operations out of the feature-author API and out of every workspace runtime. ESLint now enforces the one-way import graph per ownership root, with a vitest suite proving each boundary fires.
