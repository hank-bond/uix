---
summary: "Product and distribution: UIX is a runtime for agent apps. Three tiers consume one runtime: core UIX for engineers, Fruition as a batteries-included Electron composition, and a hosted product later. Local distribution is a native tray supervisor plus a SEA server binary."
kind: explanation
---

# Product and distribution

## Current synthesis

UIX is a runtime for agent apps, not a framework. The audience is engineers who already run Pi. They run UIX against a workspace and open the result in a browser. The authoring surface (`@uix/api`) is a small API, not an app framework you adopt.

Three tiers consume one runtime. Core UIX is the runtime, the server host, the web client, and a CLI. It is Electron-free. Fruition is a batteries-included product composition over the same runtime. It targets non-technical vibe coders. It starts as an in-repo composition and earns its own repo later. The hosted product runs the same server host per user in a VM, subdomain-isolated. Identity, tenancy, OAuth, and a marketplace are platform-layer work, not built for a long time.

Local distribution: the server ships as a Node SEA binary with Pi versioned at build time. A native macOS menu-bar app supervises server processes and opens workspaces in browser tabs. It is convenience, not a product. Any rich UI beyond the native menu is itself a UIX app in the browser. Servers announce themselves through a well-known registry.

Model currency flows through Pi's remote catalog (pi.dev overlay, about 4h refresh, verified in Pi 0.82). New models need no distribution. Pi bumps are for capabilities, not model releases. Distribution cadence is therefore decoupled from model cadence.

Everything above the substrate is a UIX app: the browser client, the Fruition window, the hosted product, and the launcher's rich UI. The native menu is OS chrome. Every pixel beyond it is UIX.

## Decisions, reasons, and tradeoffs

**Runtime, not framework.** Pi users want to compose, not adopt. A framework demands your app live inside its structures. UIX is pointed at a workspace and self-assembles. The honest phrase is "a runtime with a small authoring API." Tradeoff: a runtime is a harder story to tell than a framework. The repo and website vocabulary must carry it.

**Core is Electron-free.** The tier-1 audience is engineers with Node. A server, a CLI, and a browser tab are the minimal surface. Tradeoff: the server loses native affordances. Fruition re-adds them via the Electron host.

**Native tray supervisor, not Electron.** Electron cannot shed Chromium. Tray and Menu live in the Electron process. A native Swift menu bar app is a few MB and spawns the server as a child process. Tradeoff: native UI is a second codebase. It is worth it because the menu is small and OS-chrome-shaped.

**SEA binary, not system Node.** Checking for Node and installing it app-private opens versioning and PATH cans of worms. Menu bar apps do not inherit the shell PATH. Node may live under nvm, fnm, volta, or brew. A SEA binary pins Node and the CLI together. It is deterministic and reproducible. Tradeoff: roughly 50-80MB per binary, plus a packaging pass for Pi's runtime resource discovery.

**Pi baked at build time.** User-overridable Pi means resolving a versioned Pi at runtime. That is the versioning can of worms we declined. Model currency comes from pi.dev's remote catalog. Baking Pi therefore does not freeze model access. Tradeoff: Pi capability bumps arrive with new distributions. Rebuild automation on Pi releases mitigates that.

**Fruition is a composition, not a fork.** It uses the same runtime through the established host seams. Its guardrails are existing substrate facets: agent skills, system-prompt sections, and tools. Most of Fruition is authoring, not new substrate. Tradeoff: it cannot diverge from the runtime without becoming a second implementation. That is the one forbidden shape.

**Everything above the substrate is a UIX app.** Even the launcher's rich UI. This proves the runtime is general and dogfoods the host seams. Tradeoff: nothing beyond the native menu is privileged. All product chrome must be expressible as features and surfaces.

**Hosted and marketplace deferred, seams kept survivable.** The server host and web client are what a per-user VM runs. Tier three needs no new architecture, only tenancy and identity. The marketplace flips the trust model: in-process trusted code becomes stranger code. That is why it stays out of the runtime. Tradeoff: none for now. The deferred items are platform-layer.

**Connection-scoped sessions.** The agent/session model is recorded in the split plan: URL-scoped connections, in-place re-target without reload, refcounted per-session agents with a tunable TTL, and host-authored messages. Multi-agent semantics stay out of focus until a use case proves them.

## Log

### 2026-08-08: full product and distribution shape

Settled the three-tier shape and local distribution over one session. Core UIX is the runtime, server host, web client, and CLI, with no Electron. The status bar is a native macOS supervisor over the server binary. The launcher's rich UI is itself a UIX app in the browser. The server ships as a SEA binary with Pi baked in. Model currency via pi.dev's remote catalog decouples distribution cadence from model releases. Fruition is a separate composition over the same runtime, starting in-repo. The hosted product is the same server per user in a VM. A marketplace and OAuth are deferred platform work.

The multi-client discussion sharpened the session model. Tabs are connections scoped by URL. Session switches re-target a connection in place. Workspace switches are new connections because the client composition rebuilds. Agents are refcounted per workspace-session with a tunable TTL. The host authors messages for always-on agents. Multi-agent coordination, ref heads, and ephemeral agents are documented as future unlocks in the split plan.

Open questions: Fruition's repo timing (leaning in-repo composition until it is a branded product). The tier-1 getting-started middleground between empty-plus-docs and cloning the reference. Whether the status bar ever ships as a product or stays a dev convenience.
