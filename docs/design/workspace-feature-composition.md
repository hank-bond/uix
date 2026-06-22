---
summary: "Exploring UIX's next composition layer: features are capability/UI/state packages, workspaces compose enabled features with one or more agents and linkages, chat/canvas are default features rather than core app structure, and panes/surfaces stay layout concerns until the app/workspace model settles."
read_when: "Read before designing pane/surface/app contributions, feature-agent linking, multi-agent sharing of feature state, or deciding whether chat/canvas should be treated as substrate."
status: exploring
---

# Workspace, feature, and agent composition

## Current synthesis

UIX should not treat chat, canvas, panes, or a single app shell as the product. The substrate is a framework for building and running agent-powered and agent-authored apps: features contribute capabilities and UI/state surfaces; workspaces compose those features with one or more agents; linkages decide which features participate in which agent's tools/context/messages. A UIX "app" is likely the workspace composition, not an individual pane or feature.

The atomic authored unit remains the **feature**. A feature may contribute any mix of resources, assets, channels, UI surfaces, document stores/buffers, state, state messages, and agent tools. A feature can run without an agent if it only coordinates with other features or presents UI/state; it can also be linked to one or more agents so its agent-related facets participate in those agents' turns. Chat is just a feature linked to an agent: a naive renderer/sender for the same agent connection any other linked feature can use, choosing to display the transcript and channel/message stream rather than owning a special agent path. Chat could still contribute its own tools later, such as a UI choice/modal tool, but that would be feature-owned behavior. Canvas is just a feature that renders and edits a visual document surface. Neither belongs in substrate business logic.

A **workspace** composes enabled features, layout, resource roots, one or more agent sessions, and feature↔agent links. This is closer to "Slack workspace / VS Code workspace" than a fixed app. A user might run a workspace with chat and canvas linked to one agent, a workspace with calendar/notes/drawing features linked to separate agents, or a workspace where chat is hidden and the only agent interactions happen through buttons and forms in a custom feature UI. Linking/unlinking features at runtime should be possible; when a linkage changes, UIX should reload or update the relevant agent facets and communicate the break or join with durable custom messages.

A **pane/surface** is primarily a layout and lifecycle concept: what feature UI surface is mounted where, what it is called, whether it is visible/focused, and what context/capabilities it receives. For now it is reasonable for each visible feature to have a pane-shaped top-level surface, even if that pane is just an in-process component rather than an iframe. It is not necessarily an isolation boundary, an app boundary, or a single-resource abstraction. A feature may expose one big surface that implements its own internal chat/layout, several smaller surfaces, or none. We should defer the exact public vocabulary (`pane`, `surface`, `view`, `tab`) until the workspace model is clearer; near-term code can use a minimal layout primitive without pretending it is the final app abstraction.

Iframe isolation is a renderer strategy, not the definition of a feature or surface. Agent-authored executable content should remain isolated, and iframe/resource-backed surfaces are useful for framework independence and hosted parity, but installed feature code has an npm-package-like trust model: users choose to run it. UIX should provide framework bounds and capability-shaped APIs rather than promise hostile-extension isolation. Direct component surfaces, iframe surfaces, and web-component/resource-backed surfaces can coexist if the shared contribution data stays serializable and the renderer-specific implementation stays at the renderer edge. A workspace itself may eventually be hosted in an iframe, Slack-style, with the cockpit deciding which workspace is visible and receives global shortcuts; inside that workspace, features may still be component panes. Canvas's iframe remains feature-owned implementation detail for authored HTML/style/origin isolation, not the top-level workspace/pane abstraction.

The contribution system is evolving in two phases. **Preflight** contributions are statically inspectable declarations needed before runtime readiness, such as Electron resource schemes or future web-server route manifests. **Runtime** contributions are created with a `FeatureContext` and can close over private feature runtime objects such as document buffers. Runtime contributions currently include workspace-scoped facets (`resources`, `channels`) and agent-related facets (`agentTools`, `state`, `stateMessages`). Single-agent UIX can keep the flat bundle for now, but the eventual multi-agent model likely separates workspace feature runtime from per-agent link contributions.

Multiple agents linked to one feature are possible in principle once shared feature state has locks/concurrency controls. The substrate can already tell which facets are agent-related and install only those into a given agent, but some feature state is currently implicitly single-agent (for example canvas's `agentChangedCanvasKeys`). A future link manager will need per-agent/link-scoped instances for such state, plus resource locks or optimistic concurrency over shared documents/buffers. Canvas's anchored edit checks are already an optimistic-concurrency primitive; per-resource locks can be added when concurrent agents become real.

Immediate implication for the canvas featurification path: finish the current feature-definition/preflight/resource extraction, then pause before overfitting a public "pane contribution". The next UI step should be framed as a minimal **surface/layout contribution** or renderer feature contribution that removes hardcoded canvas/chat mounting while preserving the broader workspace-feature-agent model. Do not bake React, iframe-only isolation, single primary resource, or chat/canvas assumptions into the substrate vocabulary.

## Open questions

- What should the public UI contribution vocabulary be: `surface`, `pane`, `view`, `app`, or a layered combination, given that visible features may still be pane-shaped while workspaces may become the app-level boundary?
- Should the first renderer contribution be component-based for bundled features, iframe/resource-backed, or a renderer-kind union, and should a workspace itself be the iframe boundary while feature panes inside it are components?
- How does a workspace persist enabled features, layout, agent instances, and feature↔agent links?
- What is the smallest API for app UI to invoke agent behavior without going through a chat pane: continue conversation, one-shot run, tool-limited run, or feature-defined workflow?
- What durable message should record feature link/unlink events in the agent transcript?
- Where does per-agent link state live when one feature is linked to multiple agents?
- What lock/concurrency primitive belongs in substrate versus feature-owned buffers?

## Near-term direction

1. Keep `FeatureDefinition` with `preflight` plus `contribute(ctx)` as the first discoverable feature shape.
2. Treat `resources` and `channels` as workspace-scoped runtime contributions.
3. Treat `agentTools`, turn `state`, and `stateMessages` as agent-related contributions that are installed into the currently single agent, with a future link manager splitting them per agent.
4. Finish removing canvas from `main/index.ts` through resource contributions and bundled feature inventory.
5. Before implementing a public pane API, design the minimal renderer contribution around feature surfaces/layout and explicitly document what is temporary: likely a feature-owned pane-shaped surface, not a security boundary.

## Log

### 2026-06-20 — workspace as the app, features linked to agents

During canvas featurification, the old "pane contribution" framing started to look too narrow. The user clarified that UIX's purpose is to provide primitives for building and running agent-powered/agent-authored apps, with no substrate business logic. Chat and canvas are batteries-included bootstrap features, not required core. A user may disable canvas, hide chat, or build a single feature UI that owns its own internal chat/buttons/forms and calls the agent through substrate primitives.

We considered iframe-only panes for isolation, direct React/Lit component panes, and "one app iframe with internal web components". The resulting distinction: installed feature code has a local/npm-like trust model, while agent-authored executable output should still be isolated. Iframe isolation is valuable but should not define the pane/surface abstraction. The real composition unit is the workspace: enabled features plus layout plus one or more agents plus feature-agent linkages. Chat is a feature linked to an agent, not the agent itself.

This also exposed the multi-agent path. If features are linked to agents rather than globally baked into one agent, then multiple agents can share the same feature runtime once locks/concurrency controls exist. The substrate can identify agent-related contribution facets, but per-agent link state will eventually need separate instances. For now UIX remains single-agent, but the design should avoid choices that make multi-agent feature sharing impossible.
