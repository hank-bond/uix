---
summary: "Product and distribution: UIX provides workspace runtime, client, and host infrastructure; core UIX serves engineers, Fruition packages an Electron host with an app composition, and a hosted product later runs one host instance per user in a VM."
kind: explanation
---

# Product and distribution

## Current synthesis

UIX is a runtime for agent apps, not an application framework. The audience for core UIX is engineers who already run Pi. They point a host at explicit workspace compositions rather than adopting an application framework. The authoring surface (`@uix/api`) remains a small API.

A _host_ provides process, transport, platform, and workspace-supervision infrastructure. A _workspace runtime_ owns exactly one workspace's substrate semantics. An _app_ combines a host with explicit workspace and feature compositions for distribution. The same runtime implementation supports every tier, but each active workspace receives a distinct runtime instance. [`host-workspace-runtime-boundaries.md`](./host-workspace-runtime-boundaries.md) owns this lifecycle and repository boundary.

Three tiers use the same substrate implementation:

- **Core UIX:** The runtime, browser client, server host, CLI, and launcher contracts. It is Electron-free and does not silently install chat, canvas, developer skills, or another app composition.
- **Fruition:** A batteries-included app that combines the Electron host with opinionated workspaces, features, defaults, skills, onboarding, and guardrails. It starts as an in-repository composition and earns its own repository later.
- **Hosted Fruition:** One host instance per user in a VM, running the server host plus a Fruition composition. Identity, tenancy, OAuth, and a feature marketplace remain platform-layer work.

The local server can supervise zero or more workspace runtimes in one process. A native launcher starts the server, discovers its advertised address, queries its machine-readable workspace catalog, and opens canonical workspace-session URLs. It is convenience infrastructure rather than an app composition. The web launcher and the native launcher are clients of the same catalog service.

The server ships as a Node single executable application binary with Pi versioned at build time. Model currency flows through Pi's remote catalog. New models do not require a UIX distribution, while Pi capability changes arrive through rebuilt distributions. User-overridable Pi remains deferred until a need proves the versioning cost.

The monorepo separates reusable substrate packages, hosts, and app source. `packages/` owns API, runtime, and shared browser client code. `hosts/` owns Electron and server composition roots. `apps/features/` owns reusable app-layer feature implementations, while `apps/workspaces/` owns explicit reference and product workspace compositions with optional local features. Shared feature source remains manifest-selected rather than globally discovered.

## Decisions, reasons, and tradeoffs

**Runtime, not framework.** Pi users want to compose rather than adopt. UIX runs an explicit workspace and activates its chosen features. Tradeoff: a runtime is a harder story to tell than a framework, so repository and website vocabulary must carry the distinction.

**Runtime instances are workspace-scoped.** One host supervises several runtime instances in one process, and each runtime's lifetime bag isolates its workspace. Process isolation is not a goal; a hosted deployment isolates users by VM. Tradeoff: the host needs a workspace supervisor, but no workspace runtime gains sibling-workspace policy or global mutable state.

**Hosts are infrastructure, apps are compositions.** Electron and server are host implementations. Fruition and repository demos combine a host with selected workspaces and features. Tradeoff: distribution wiring becomes explicit rather than hiding defaults inside a host.

**Core is Electron-free.** The tier-one audience is engineers with a server, CLI, and ordinary browser. Native affordances belong to the Electron host or the native launcher. Tradeoff: core workflows cannot assume native dialogs or window APIs.

**Native launcher, not Electron launcher infrastructure.** Electron cannot shed Chromium because tray and menu APIs live in its process. A native Swift menu-bar application can supervise the server binary without carrying a browser engine. It lives outside the host and consumes host capability endpoints. Tradeoff: the small native surface is a second codebase.

**One launcher catalog, several adapters.** HTTP, CLI JSON, Electron, and native clients consume one versioned projection. Tradeoff: host-level catalog contracts need an owner outside the feature-author API and outside any workspace runtime.

**Single executable application binary, not system Node.** Menu-bar applications do not inherit a reliable shell path, and Node may live under several managers. A self-contained binary pins Node, the CLI, and Pi together. Tradeoff: each binary is larger and Pi resource discovery needs a packaging pass.

**Pi baked at build time.** User-overridable Pi requires runtime version resolution. Pi's remote model catalog decouples model availability from binary releases. Tradeoff: capability bumps arrive with distribution updates rather than independently.

**Fruition is a composition, not a fork.** It uses the same host and runtime boundaries as core UIX. Its guardrails use ordinary substrate facets such as skills, system-prompt sections, tools, settings, and surfaces. Tradeoff: product needs must either fit those primitives or justify improving the shared substrate rather than diverging.

**Hosted and marketplace work remains deferred.** A hosted deployment runs one host instance per user in a VM, so it needs no process-isolation protocol beyond the local architecture. Stranger-code trust, identity, tenancy, and marketplaces stay outside the local runtime design. Tradeoff: core UIX does not claim that changing a bind address creates a hosted architecture.

## Log

### 2026-08-08: full product and distribution shape

Settled the three-tier shape and local distribution over one session. Core UIX is the runtime, server host, web client, and CLI, with no Electron. The status bar is a native macOS supervisor over the server binary. The launcher's rich UI is itself a UIX app in the browser. The server ships as a SEA binary with Pi baked in. Model currency via pi.dev's remote catalog decouples distribution cadence from model releases. Fruition is a separate composition over the same runtime, starting in-repo. The hosted product is the same server per user in a VM. A marketplace and OAuth are deferred platform work.

The multi-client discussion sharpened the session model. Tabs are connections scoped by URL. Session switches re-target a connection in place. Workspace switches are new connections because the client composition rebuilds. Agents are refcounted per workspace-session with a tunable TTL. The host authors messages for always-on agents. Multi-agent coordination, ref heads, and ephemeral agents are documented as future unlocks in the split plan.

Open questions: Fruition's repo timing (leaning in-repo composition until it is a branded product). The tier-1 getting-started middleground between empty-plus-docs and cloning the reference. Whether the status bar ever ships as a product or stays a dev convenience.

### 2026-08-09: hosts, workspace runtimes, and app compositions

Separated host infrastructure from app composition. Electron and server are discrete hosts. Each active workspace receives one runtime instance, while a host-level supervisor keeps several runtimes in one process behind lifetime-bag isolation. A global multi-workspace runtime was rejected because workspace retention and retirement are host policy.

Settled the hosted model as VM-per-user isolation. Local usage has no trust boundary between workspaces, and a hosted deployment gives each user a VM running one host instance, which is the local architecture unchanged. Process-isolated workspace runtimes and any cross-process runtime protocol are no longer part of the design.

Moved launcher semantics above workspace runtimes. The web picker, CLI JSON, Electron picker, and native macOS supervisor consume one catalog projection through different adapters. A host can serve the launcher with zero active workspaces and lazily create runtimes from canonical workspace-session URLs.

Defined an app as a host plus explicit workspace and feature compositions. This replaces the earlier claim that every interface above the substrate is itself a UIX app. Host launchers remain infrastructure, while Fruition and repository demos are apps. The repository reflects the distinction through `packages/`, `hosts/`, and `apps/` ownership roots.
