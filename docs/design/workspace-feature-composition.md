---
summary: "Exploring UIX's next composition layer: Host is the desktop/web embedding layer, Workspace is the web-compatible app runtime that composes feature surfaces and agent links, features are reusable capability/UI/state packages, and chat/canvas are defaults rather than core app structure."
read_when: "Read before designing Host/Workspace boundaries, surface contributions, feature-agent linking, multi-agent sharing of feature state, or deciding whether chat/canvas should be treated as substrate."
status: exploring
---

# Workspace, feature, and agent composition

## Current synthesis

UIX should not treat chat, canvas, panes, or a single app shell as the product. The substrate is a framework for building and running agent-powered and agent-authored apps: features contribute capabilities and UI/state surfaces; workspaces compose those features with one or more agents; linkages decide which features participate in which agent's tools/context/messages. A UIX "app" is likely the workspace composition, not an individual pane or feature.

The frontend boundary should be **Host → Workspace**. Host is the embedding layer: in desktop it is the Electron shell/preload/windowing bridge, and in hosted mode it becomes the browser page/server embedding layer. Workspace is the web-compatible app runtime: it should avoid Electron assumptions, own feature surface layout/composition, and talk to backend substrate through a web-shaped bus/API. Electron packages Host plus backend substrate together locally, but the concepts stay separate: Host embeds/switches workspaces, Workspace runs the composed app UI, backend substrate owns agents/documents/resources/channels/state.

The atomic authored unit remains the **feature**. A feature may contribute any mix of resources, assets, channels, UI surfaces, document stores/buffers, state, state messages, and agent tools. A feature can run without an agent if it only coordinates with other features or presents UI/state; it can also be linked to one or more agents so its agent-related facets participate in those agents' turns. Chat is just a feature linked to an agent: a naive renderer/sender for the same agent connection any other linked feature can use, choosing to display the transcript and channel/message stream rather than owning a special agent path. Chat could still contribute its own tools later, such as a UI choice/modal tool, but that would be feature-owned behavior. Canvas is just a feature that renders and edits a visual document surface. Neither belongs in substrate business logic.

A **workspace** composes enabled features, layout, resource roots, one or more agent sessions, and feature↔agent links. This is closer to "Slack workspace / VS Code workspace" than a fixed app. A user might run a workspace with chat and canvas linked to one agent, a workspace with calendar/notes/drawing features linked to separate agents, or a workspace where chat is hidden and the only agent interactions happen through buttons and forms in a custom feature UI. Linking/unlinking features at runtime should be possible; when a linkage changes, UIX should reload or update the relevant agent facets and communicate the break or join with durable custom messages. On the frontend, the workspace runtime is likely hosted inside a host-owned iframe: the Host is the app runner and workspace switcher, while the Workspace iframe owns the collection/layout of feature surfaces.

A **surface** is primarily a layout and lifecycle concept inside a workspace: what feature UI surface is mounted where, what it is called, whether it is visible/focused, and what context/capabilities it receives. For now it is reasonable for each visible feature to have a pane-shaped top-level surface, even if that surface is just a trusted component mounted in a shadow root. It is not necessarily an app boundary or a single-resource abstraction. A feature may expose one big surface that implements its own internal chat/layout, several smaller surfaces, or none. The host/workspace can later reorder, resize, focus, and toggle surfaces like a windowing environment; the contribution declares the surface exists, not where it must live.

Surface rendering has two intended containment levels. **Shadow surfaces** are the default for trusted/reusable feature UI inside a workspace iframe: they provide style/DOM hygiene and component-like reuse, but not a security boundary. **Iframe surfaces** are nested containment boundaries for imported/foreign/generated/executable UI or dependency/runtime isolation. Shadow and iframe surfaces are not naively swappable modes; authors choose the kind up front and design with its limits in mind. The substrate should still expose as much overlapping public surface API as practical. Shadow surfaces receive the workspace bus/context directly because they share the workspace iframe's JS realm; iframe surfaces receive a proxy over `postMessage` that forwards to the same logical bus. Canvas's authored HTML remains iframe-contained because that feature needs document/style/origin isolation, while chat can be a shadow surface over a linked agent connection.

The contribution system is evolving in two phases. **Preflight** contributions are statically inspectable declarations needed before runtime readiness, such as the substrate resource protocol or future web-server route manifests. **Runtime** contributions are created with a `FeatureContext` and can close over private feature runtime objects such as document buffers. Runtime contributions currently include workspace-scoped facets (`resources`, `channels`) and agent-related facets (`agentTools`, `state`, `stateMessages`). Surface contributions will be workspace/frontend runtime facets. Single-agent UIX can keep the flat bundle for now, but the eventual multi-agent model likely separates workspace feature runtime from per-agent link contributions.

Multiple agents linked to one feature are possible in principle once shared feature state has locks/concurrency controls. The substrate can already tell which facets are agent-related and install only those into a given agent, but some feature state is currently implicitly single-agent (for example canvas's `agentChangedCanvasKeys`). A future link manager will need per-agent/link-scoped instances for such state, plus resource locks or optimistic concurrency over shared documents/buffers. Canvas's anchored edit checks are already an optimistic-concurrency primitive; per-resource locks can be added when concurrent agents become real.

Immediate implication for the canvas/chat featurification path: finish the current feature-definition/preflight/resource extraction, then make chat and canvas default feature surfaces without treating them as substrate. The next UI step should be framed as a minimal **surface/layout contribution** that removes hardcoded canvas/chat mounting while preserving the broader workspace-feature-agent model. Do not bake React, iframe-only isolation, single primary resource, or chat/canvas assumptions into the substrate vocabulary. Current code may temporarily host surfaces directly in the host renderer, but the target frontend shape is a host-owned workspace iframe that hosts shadow and nested-iframe surfaces.

## Open questions

- What should the public UI contribution vocabulary be: `surface`, `pane`, `view`, `app`, or a layered combination, given that visible features may still be pane-shaped while workspaces may become the app-level boundary?
- Should the first surface implementation introduce the Workspace iframe before moving chat/canvas into surface contributions, or is any direct-in-Host stepping stone still worth keeping?
- How does a workspace persist enabled features, layout, agent instances, and feature↔agent links?
- What is the smallest workspace bus/API for surface UI to invoke agent behavior without going through a chat surface: continue conversation, one-shot run, tool-limited run, or feature-defined workflow?
- What durable message should record feature link/unlink events in the agent transcript?
- Where does per-agent link state live when one feature is linked to multiple agents?
- What lock/concurrency primitive belongs in substrate versus feature-owned buffers?
- What events belong on the backend-routed durable bus versus an app-local ephemeral UI bus?

## Near-term direction

1. Keep `FeatureDefinition` with `preflight` plus `contribute(ctx)` as the first discoverable feature shape.
2. Treat `resources` and `channels` as workspace-scoped runtime contributions.
3. Treat `agentTools`, turn `state`, and `stateMessages` as agent-related contributions that are installed into the currently single agent, with a future link manager splitting them per agent.
4. Finish removing canvas from `main/index.ts` through resource contributions and bundled feature inventory.
5. Before implementing a public surface API, design the minimal renderer contribution around feature surfaces/layout and explicitly document what is temporary: likely a feature-owned pane-shaped surface inside a workspace runtime, not a security boundary.

## Log

### 2026-06-20 — workspace as the app, features linked to agents

During canvas featurification, the old "pane contribution" framing started to look too narrow. The user clarified that UIX's purpose is to provide primitives for building and running agent-powered/agent-authored apps, with no substrate business logic. Chat and canvas are batteries-included bootstrap features, not required core. A user may disable canvas, hide chat, or build a single feature UI that owns its own internal chat/buttons/forms and calls the agent through substrate primitives.

We considered iframe-only panes for isolation, direct React/Lit component panes, and "one app iframe with internal web components". The resulting distinction: installed feature code has a local/npm-like trust model, while agent-authored executable output should still be isolated. Iframe isolation is valuable but should not define the pane/surface abstraction. The real composition unit is the workspace: enabled features plus layout plus one or more agents plus feature-agent linkages. Chat is a feature linked to an agent, not the agent itself.

This also exposed the multi-agent path. If features are linked to agents rather than globally baked into one agent, then multiple agents can share the same feature runtime once locks/concurrency controls exist. The substrate can identify agent-related contribution facets, but per-agent link state will eventually need separate instances. For now UIX remains single-agent, but the design should avoid choices that make multi-agent feature sharing impossible.

### 2026-06-20 — Host/Workspace split and surface containment

Refined the frontend model: Host is the embedding layer and Workspace is the web-compatible app runtime. In Electron, Host is the desktopification layer around a workspace iframe plus backend substrate; in a hosted deployment, Host becomes the page/server embedding layer. Everything nested under Workspace should be designed as browser-compatible app code, not Electron/preload-specific code.

Surfaces live inside Workspace. Shadow surfaces are the normal trusted/reusable feature composition mode, analogous to reusable component packages: they preserve feature boundaries for reuse and lifecycle but are not a security boundary. Iframe surfaces are available when a feature wants stronger containment, separate runtime/dependencies, imported/foreign code, or generated executable UI. The two modes are not naively swappable; the shared goal is API overlap through the workspace/backend bus, not identical implementation.

Durable, agent-relevant, or inter-feature events should route through the backend bus because backend owns state, rehydration, transcript/custom-message effects, and agent context. Ephemeral UI coordination can remain local inside Workspace. Nested iframe surfaces do not get a special second bus: they proxy over `postMessage` to the same logical workspace/backend bus that shadow surfaces call directly from within the Workspace iframe.
