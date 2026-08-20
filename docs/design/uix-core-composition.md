---
summary: "Exploring UIX's Pi composition root, grouped feature facets, registry-to-installer boundary, reload reconciliation, typed communication, and base-tool composition."
kind: explanation
status: exploring
---

# UIX-core composition onto pi

## Problem

UIX contributes tools, hooks, prompt sections, skills, turn state, and model context to Pi. Pi dispatches hooks by registration order without priorities, so installer order is semantic. UIX also owns non-Pi facets such as surfaces, channels, resources, settings, and documents. The design question is how these facets compose without collapsing their ownership or lifecycles.

## Current synthesis

### Pi composition root

UIX adapts its agent facets through one in-process Pi extension factory. `createUixCoreExtension()` runs an ordered list of `AgentInstaller` functions, and list order defines Pi hook order.

Feature authors do not receive Pi's `ExtensionAPI`. They contribute declarative agent facets through `@uix/api`; substrate registries resolve and validate those values. Internal installers then register tools, turn-state hooks, skills, system-prompt sections, model context, and model-status observation with Pi.

This keeps three roles separate. Features author contributions, registries own live accepted values, and installers attach one registry snapshot to a Pi runtime generation.

### Features and facets

A feature is UIX's loadable and lifetime unit. A facet is one substrate contribution axis, such as channels, resources, surfaces, tools, skills, turn state, or model context.

A feature can participate in many facets. Its definition exposes top-level Workspace and Agent feature-state prerequisites plus grouped contribution sections. Definition and settings admission remains feature-level; each later state, contribution, registration, restoration, and installation operation owns its own outcome and rollback bag where the downstream integration permits.

A package can contain Pi extensions and UIX feature entries, but neither system adopts the other's lifecycle. Pi discovers its own extension resources while the workspace manifest selects UIX feature entries.

### Authority and coordination

Main-owned stores and registries remain authoritative. Surfaces use typed channels for requests and events; they do not message peer surfaces or import backend owners.

`TurnStateCoordinator` sequences branch-scoped feature snapshots and restoration. The model-context assembler combines model-visible sections. `WorkspaceReloadCoordinator` sequences feature replacement, Pi reconciliation, restoration, and renderer notification.

These coordinator and assembler roles do not become authorities over participant state. Each feature retains its own snapshot, restore, materialization, and domain behavior.

### Reload reconciliation

Reload reconciles disk into one accepted manifest generation, then replaces the active feature composition. Agent-facing registry changes reach Pi through native resource reload when Pi has already initialized.

The renderer treats main registries as authoritative. Surface notifications cause it to request and reconcile the latest composition. Electron or Vite hard reload remains development tooling.

### Base-tool composition and replacement boundaries

All features use one Agent-tool contribution shape. Ordinary feature tools derive `${featureId}__${localName}`. One optional `baseTools: true` flag on a manifest feature entry designates the sole provider whose local names remain prefix-free as workspace-wide Agent vocabulary. The designation changes identity only; it grants no additional authority. Competing marked entries fail manifest validation, and a failed provider never causes a silent fallback.

Other replacement seams should be earned independently. A replaceable command palette, settings editor, or resource viewer consumes a stable public catalog rather than receiving private registry callbacks.

### Why the composition root is semantic

Pi chains mutating hooks in registration order and exposes no priority field. Input transforms, prompt edits, tool-call mutations, context transforms, and result rewrites can each observe a prior handler's output. The installer list is therefore a dependency graph, not only an inventory.

Pure observers and distinct tools may be order-independent, but keeping their installation in the same root makes Pi runtime composition reviewable. Scattered registration would turn import order into hidden behavior.

A declarative contribution remains preferable for feature authors, but the substrate installer must receive Pi's live API. Operations such as `appendEntry()` and hook registration are imperative at a specific runtime boundary. The registry-to-installer split preserves declarative feature contracts without pretending Pi installation is static data.

### State lifecycle transaction

Turn state, model context, and the user-run boundary are related phases. A feature can prepare stable refs, persist branch state, derive model context from those committed facts, and later restore its state. The coordinator owns ordering while each cell or context contribution owns domain meaning.

This transaction should not collapse turn state into model context. Model-invisible state and model-visible context have different retention and replay behavior. They share a boundary only where one run needs a coherent snapshot.

### Override model retained from Pi

Pi demonstrates four useful seam granularities:

1. **Replace a unit:** A same-name tool or renderer substitutes one complete capability.
2. **Inject operations:** A unit retains policy while side-effecting operations switch between local, remote, or hosted implementations.
3. **Decorate discovery:** A caller receives a default resource set and returns a transformed set.
4. **Mutate at a lifecycle boundary:** A hook observes or rewrites flow without owning the underlying unit.

UIX should expose ports at policy decisions and seal mechanisms that callers should not replace. Tool selection, resource delivery, context, and presentation can earn typed seams. Agent-loop scheduling, session format, registry invariants, and transport internals should not become generic escape hatches.

Pi also separates its SDK from its running `ExtensionAPI`. UIX consumes the SDK as a harness and exposes its own curated feature contracts. It can forward Pi-facing logic where appropriate, replace terminal presentation with React, and add UIX-owned surfaces, channels, and resources without exposing Pi's raw handle.

### Communication topology

Surfaces do not synchronize by messaging one another. Main-owned authorities receive typed requests and publish events; multiple surfaces converge because they observe the same authority.

Three relationships remain useful:

- **Tap:** Observe a live change feed without taking write authority.
- **Message:** Send an effectful request to the authority's owner.
- **Direct integration:** Give two features or facets the same owner-scoped store or capability during composition.

Durable entries differ from ephemeral signals. Pi session entries can replay after restart or branch selection. A renderer click has no Agent meaning until a feature converts it into a user message, tool continuation, or custom entry.

A future backend transcript tap must remain live-only unless its result is persisted deliberately. Session restoration should derive durable state rather than replaying historical side effects through live observers.

Consumer-side selection also remains important. Entries and resources are typed by what they are, not addressed to one renderer. A consumer opts in by registering support for that type; adding a producer does not force every surface to change.

### Hardcode along the contribution grain

Do not extract a registry or public seam before a second contributor or first real override needs it. Concrete first-party code should still follow the future boundary: surfaces talk through channels, authoritative state stays in main-owned stores, rendering dispatches on typed data, and stateful mechanisms expose narrow interfaces.

This makes later extraction a refactor rather than a redesign. It also prevents a speculative abstraction from becoming a privileged path that ordinary features cannot replace.

### Open axes

- Which additional Pi hooks need declarative feature facets rather than substrate-only installers?
- When should an agent-facing registry mark a dirty runtime automatically instead of relying on workspace reload ordering?
- Which cross-feature catalogs earn substrate ownership after actions, models, and provider authentication?
- How should a future server host preserve installer order and lifetime semantics across process boundaries?

## Log

### 2026-07-16 — live message taps produce state; restoration consumes turn state

Session-switch design separated two mechanisms that can share feature-internal logic but not lifecycle semantics. A live message tap observes new agent/user activity and may update working state; it is never rerun merely because a session loads, reloads, or rewinds. Any tap-derived value that must survive those transitions has to reach `uix.turn-state` directly or through stable referenced ids, while uncommitted buffer state remains intentionally ephemeral. Restoration walks the selected branch once for transcript projection and the latest complete value of every currently registered named turn-state cell; each owning cell validates and restores that value or resets from `undefined`. Raw message replay is not the feature-state recovery mechanism, avoiding repeated side effects and compaction dependence. The feature-facing live tap remains unbuilt and is tracked in the plans backlog.

### 2026-07-01 — feature becomes the loadable unit

The "extension package installs features" two-level vocabulary from the 2026-06-07 entry is retired: the feature is the loadable unit, discovered entries default-export a plain `FeatureDefinition`, and the injected-`ExtensionAPI` factory dies. Bundled and discovered features share one registration path under the reload bag — the driver/bag/reload reconciliation model from the 2026-06-18 entry applies to all features, bundled included, because the expected loop is the agent self-modifying feature source and the user reloading. See [features-are-the-loadable-unit](../decisions/2026-07-01-features-are-the-loadable-unit.md) and [feature-loading-convergence](../../plans/archive/feature-loading-convergence.md); the synthesis above has been updated in place.

### 2026-06-18 — drivers, extension reload, and Pi reconciliation

We sharpened the vocabulary around extension loading and reload. “Host” and “meta facet” both described part of the shape, but the reusable concept is **driver**: a lifecycle owner that runs installers, owns bags, and controls teardown/reload ordering. The extension driver reconciles disk to UIX memory by clearing per-extension bags and re-running extension installers. Facet registries are responsible for marking the agent install surface dirty when their contributions compile to Pi install-time behavior; the agent driver then reloads Pi before the next agent turn. The renderer shell is likewise registry-driven: main sends registry state/change payloads, React reconciles surfaces. Vite/Electron hot reload is only dev tooling.

### 2026-06-17 — state lifecycle as a substrate domain

Canvas snapshots exposed that the canvas agent installer is the wrong long-term owner for state lifecycle. The current slice can snapshot canvases and append `uix.turn-state`, but the design target is broader: UIX core owns a `src/main/state/` domain where contributions prepare side effects, return stable refs/slices, render model-visible state sections, and define restore hooks. This keeps `CustomEntry`, `CustomMessageEntry`, and the user-message boundary ordered as one transaction, and makes rollback/branch preview the mirror of submit prep. The chat pane remains a pane over the agent session, not the agent session primitive; canvas and future JSON/app-state panes become state contributors plus pane/tool contributions.

### 2026-06-07 — thread opened

Origin: a planning conversation walking C1 forward. C1 ([persistence-and-session-foundation](../../plans/persistence-and-session-foundation.md)) **landed narrow** — one factory (`createUixCoreExtension`) wrapping the existing `collectAgentBinding*` helpers. A fresh agent reading only that plan could not reconstruct the intended structure (composition root running ordered per-subsection facets), because the structure was nowhere written: `session-file-as-state-substrate` framed the extension only as "to get write access," `pi-self-extension-ethos` gave philosophy without mechanism, and `conversation-render-primitives` covered only the render axis. This thread captures the broader structure that walk surfaced — composition root + the pi-dispatch ordering rationale, the facet / override / communication models, and a best-effort vocabulary.

The ordering kernel is firm enough to record as a decision ([uix-core-composition-root](../decisions/2026-06-07-uix-core-composition-root.md)) because it is _forced by pi's dispatch semantics_, not chosen. The facet generalization and the vocabulary are **tentative** — captured here as discussion context, explicitly not a commitment to this exact shape. Walk that produced it: pane concept (single-surface vs block-stream; pane ≠ block container), block concept (a registered typed renderer, not "just a component"), the interactive-button round-trip (durable entry + ephemeral signal + conversion), and the five-feature stress test (canvas local→remote redirect, message→sqlite tap, sparkline block, file-browser pane, history-tree pane) which the facet model carried with no special case — three of the five are net-new non-agent facets.

### 2026-08-18 — grouped lifecycle lanes replace flat facets and tool overrides

Made the Workspace/Agent context dependency visible in the author contract. Top-level context factories precede grouped `workspace` and `agent` contribution sections, while the substrate retains scheduling control over independent sibling operations. Definition and settings admission remains feature-level; later operation failures preserve successful siblings where their downstream integration can remain valid.

Dropped the exact-name tool-override axis from the target contract. One ordinary tool path derives feature-prefixed names unless the manifest entry is the workspace's sole `baseTools` provider. This keeps prefix-free `read`/`write`/`command` vocabulary without giving feature source a second contribution type or implying replacement authority.

### 2026-08-18 — live feature state owns contribution dependencies

Replaced executable Workspace/Agent “context” with `WorkspaceFeatureState` and `AgentFeatureState`. State here is the live object graph: mutable values plus services and capabilities that operate on them. `workspaceState()` and `agentState()` build one atomic prerequisite for their matching contribution section. Each chained, single-entry addition transfers disposal into a candidate bag immediately and accumulates the inferred readonly state type. Turn state and model context then become explicit durable and model-visible projections of Agent feature state rather than competing meanings of context.
