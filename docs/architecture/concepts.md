---
summary: "Canonical UIX concept vocabulary: feature, facet, installer, driver, hook, contribution point, contribution, capability handle, registry, store, buffer, coordinator, assembler, reload reconciliation, and agent-context-local terms, with boundaries from pi extension vocabulary."
status: active
---

# Concept vocabulary

This is the canonical vocabulary for UIX architecture discussions and code names. Use it to avoid overloading pi terms and to keep public extension concepts separate from internal substrate wiring.

## Feature

A **feature** is the coherent capability being added: canvas, conversation, a chess board, a file browser, a report renderer. A feature may be first-party in-tree or supplied by a UIX extension package.

A feature is conceptual: what it does. An extension package is concrete: how UIX discovers, activates, reloads, and lifetimes loadable code. Most packages will start as one extension package installing one feature, but a package may install several related features.

A feature is not itself one registration. It may include several pieces:

- UIX contributions, such as panes, commands, state messages, or channel handlers;
- agent installers, such as code that registers tools or Pi hooks;
- renderer code, services, stores, styles, and assets.

Use **feature** when naming the user-facing capability. Use **extension** when you mean the loadable package/activation boundary or a Pi extension factory.

## Identifier grammar

UIX uses two id grammars for different things.

**Contribution ids** are derived by the facets, never hand-authored. A feature author gives a local `name`; the facet derives two ids:

- **`ContributionId`** — the registry dedup key. One uniform brand across all facets, constructed by `toContributionId(featureId, facet, name)` → `${featureId}.<facet>.<name>`. Examples: `canvas.channel.writeback`, `canvas.agent.anchor_read`, `canvas.agent-context.pane-visibility`.
- **`…CanonicalId`** — the downstream-system address (transport channel, pi tool name, resource type key, persisted-section key, storage blob key). One brand per facet, because each downstream system has its own naming convention. The facet segment is **dropped** from the canonical id, because within the downstream system the channel/tool/resource kind is implicit. Examples: `ChannelCanonicalId` `canvas.writeback`, `AgentToolCanonicalId` `canvas__anchor_read` (pi's double-underscore), `ResourceCanonicalId` `canvas-doc` (resource type; resource URL scheme is substrate-owned).

Both are nominal brands constructed only by their validated helper; internal code (registry Sets, resolved `…Registration` shapes) carries the brand, and genuine external string boundaries (Electron IPC channel, pi `tool.name`, URL/path strings) cast inline (`id as string`, the `CanvasKey` precedent). The public `@uix/api` modules expose author shapes only — `…Contribution` types with a `name` field, no id fields, no brands. The cross-facet `ContributionId` grammar lives in `#shared` (`src/shared/contribution-id.ts`); per-facet canonical-id helpers and resolved `…Registration` shapes live with their consumer — in `#shared` for facets with a renderer consumer (channels in `src/shared/channel-normalization.ts`, resources in `src/shared/resource-canonical-id.ts`), in `src/main/` for main-only facets (agent tools, agent context, turn state).

Envelope and customType ids stay substrate-owned and are not feature-scoped: `uix.state` (the display-hidden agent-context envelope), `uix.turn-state` (the persisted turn-state entry). Only the inner contribution tags go feature-scoped (e.g. `<canvas.pane-visibility>` inside `<uix-state>`).

Event payload shapes are defined by the emitting substrate facet. If a pane-originated write causes a document event, `sourceId: "canvas.pane.writeback"` is provenance, but the payload is still the document facet's `DocumentWriteEvent` shape. A contribution in one facet may call another facet; `eventType`/channel tells you what happened, and `sourceId` tells you which contribution caused it.

**Resource ids** name addressable things. URI schemes identify substrate resource managers: `doc://canvas/main` is a document-engine resource in the canvas namespace; `workspace://src/main.ts` is a workspace file interpreted relative to the turn's recorded cwd. Feature/facet organization does not appear inside resource paths — the same resource may be read by a pane, edited by an agent tool, snapshotted by state, and restored by the coordinator.

Use `uix.*` only for substrate-owned dotted ids (envelopes/customTypes). Bundled default features are still features, so their contribution ids use feature namespaces such as `canvas.*` and `chat.*`.

The build spec for landing this model across the five facets is [contribution-id-derivation](../plans/contribution-id-derivation.md).

## Contribution point

A **contribution point** is a UIX substrate API slot that accepts contributions.

Examples:

- `registerCommand(...)`
- `registerAgentContextContributions(...)`
- future `registerPane(...)`
- future `registerChannelHandler(...)`

A contribution point defines validation, lifetime, ownership, and how registered contributions are later used by the substrate.

## Registration

A **registration** is one concrete setup action that adds a contribution, callback, or capability to a contribution point or runtime surface.

Examples:

- `state.register(contribution)`;
- `stateMessages.register(contribution)`;
- `pi.registerTool(tool)`;
- `pi.on("input", handler)`;
- `ipc.handle(channel, handler)`.

Registering answers: what one concrete thing was added? Installing answers: how does a whole slice attach to the system?

A registered callback at a lifecycle point is a hook. For example, `pi.on("input", handler)` registers an `input` hook.

## Contribution

A **contribution** is the object a feature registers into a UIX contribution point: a declarative unit of capability or state that the substrate owns after registration.

A contribution must be:

- **owned by one feature** — one feature is responsible for its identity, schema, materialization/rendering contract, and disposal;
- **registered at a contribution point** — it enters UIX through a `register*` API rather than by importing cockpit internals;
- **lifetime-scoped by the substrate** — disposal/unload removes it from the registry;
- **described by what it offers, not by how a downstream consumer happens to use it**.

Examples:

- a command contribution describes a human-invokable verb;
- an agent-context contribution describes one model-visible state section;
- a future pane contribution describes a mountable surface;
- a future channel-handler contribution describes a typed pane→main message handler.

Do not use **contribution** as a generic synonym for any behavior-changing code. An internal function that calls `pi.registerTool(...)` is an agent installer, not a UIX contribution, unless it is itself registered through a UIX contribution point.

## Capability handle

A **capability handle** is the value returned by a registration when the contributor needs an imperative capability after registration.

Examples:

- an agent-context update contribution returns a handle with `update(payload)`;
- an agent-context append contribution returns a handle with `append(payload)`;
- many contribution points return no handle because the registered object already contains the needed callbacks.

A handle belongs to the registering feature. It should not become a shared stringly API for other features to drive.

## Registry

A **registry** is the substrate-owned collection of currently registered contributions for one contribution point.

A registry is working memory, not durable authority. Durable state lives in Pi session entries, content stores, or other explicitly owned stores. The registry answers: what contributions are live right now?

A registry is not a `DisposableBag`. The registry owns the live contribution index and invariants such as duplicate-id checks; the `Disposable` returned by `register(...)` removes that one contribution; a caller-owned bag decides when that removal happens. Hosted extension APIs should auto-scope registration disposables to the extension's lifetime bag, and first-party wiring should add registration disposables to an explicit bag when the contribution lifetime is shorter than the app.

## Store

A **store** is a durable source-of-truth API or implementation for a state domain. It owns the persistence semantics for that domain — local files, a future git/object-store backend, or another backing implementation are hidden behind the store interface. Callers address store values by stable ids, not by implementation paths.

A store may expose a change feed when the change semantics are generic at that layer. If liveness is domain-specific, the feature or buffer above the store publishes the higher-level invalidation event instead. For example, `DocumentStore` persists current document bytes and immutable versions but does not emit canvas refresh events; the canvas feature publishes `canvas.changed` when an agent-originated document write should refresh the iframe.

## Buffer

A **buffer** is a live, feature-specific working projection over a store. It may cache regenerable session state, normalize or validate writes, reconcile editor state, and translate between feature semantics and the store's generic durable shape.

A buffer is not durable authority. It writes authoritative state through its backing store and can rebuild from store contents when needed. For example, `CanvasDocumentBuffer` keeps anchored document projections, canonicalizes HTML, and reconciles anchors while `DocumentStore` remains the durable current/version store underneath.

## Facet

A **facet** is a coherent slice of behavior we try to keep self-contained and discrete. It is a conceptual boundary, not necessarily one file, one class, or one registration.

Examples:

- state management;
- state messages;
- pane hosting;
- channels;
- transcript identity;
- the agent-facing side of a feature.

A feature may participate in many facets. For example, a canvas feature can contribute a pane to the pane-hosting facet, tools to the agent/tooling facet, turn-state snapshots to the turn-state facet, and model-visible sections to the agent-context facet.

Use **facet** for the behavioral slice. Use **feature** for the product/capability bundle that may be packaged as a UIX extension.

## Installer

An **installer** is setup-time code that attaches a facet or feature side to a runtime by registering concrete pieces of behavior.

An installer may register:

- tools;
- hooks;
- commands;
- IPC handlers;
- Electron protocols;
- UIX contributions.

Installers answer: how does this slice attach to the system? Registrations answer: what one concrete thing was added?

An **agent installer** is the Pi-facing installer shape: it receives Pi's `ExtensionAPI` and registers behavior that affects the agent/session runtime. Agent installers may call Pi APIs such as:

- `pi.registerTool(...)`
- `pi.on(...)`
- `pi.appendEntry(...)`
- `pi.sendMessage(...)`
- `pi.sendUserMessage(...)`

Agent installers are composed inside UIX-core's single in-process Pi extension factory. They are internal substrate wiring, not public UIX extension contributions.

## Driver

A **driver** owns a runtime or lifecycle boundary. It creates the relevant lifetime bag(s), runs installers or otherwise attaches behavior for that boundary, arranges teardown/reload ordering, and exposes the small control surface other code uses to drive that runtime.

Examples:

- the agent driver owns the Pi session boundary: session creation/resume, prompt/reload/history, live event forwarding, and the Pi extension factory that runs agent installers;
- the extension driver owns extension activation: discovery, per-entry bags, injected API construction, activation/reload/error isolation, and teardown of registered contributions.

Drivers own bags. Installers register things. Registries track live contributions. Bags decide when the registration disposables run.

## Hook

A **hook** is a runtime callback registered at a named lifecycle point.

Examples:

- `pi.on("input", handler)` registers an `input` hook;
- `pi.on("before_agent_start", handler)` registers a `before_agent_start` hook;
- `pi.on("agent_end", handler)` registers an `agent_end` hook.

Installers register hooks. Hooks run later when the lifecycle event occurs.

## Coordinator

A **coordinator** is substrate-owned glue that runs a lifecycle across many registered contributions and performs the side effects for that lifecycle.

The current example is the turn state coordinator:

- installs Pi `input` and `agent_end` hooks;
- asks live state contributions to prepare private turn state;
- persists contribution-keyed opaque state;
- appends one `uix.turn-state` session entry when there is state to persist.

A coordinator owns timing and cross-contribution mechanics. The contributing feature owns the data it prepares.

## Assembler

An **assembler** is a substrate-owned pattern for turning many registered contributions into one runtime artifact or hook result.

The current example is the agent-context assembler:

- reads registered agent-context contributions;
- computes the vocabulary section once for a Pi install;
- materializes live contributions while preparing an agent run;
- performs branch comparison and append confirmation;
- assembles one display-hidden `uix.state` custom message;
- installs a Pi `before_agent_start` hook through an agent installer.

Coordinators and assemblers are both cross-contribution substrate patterns. A coordinator emphasizes lifecycle orchestration and side effects; an assembler emphasizes building one combined artifact from many contributions.

## Reload reconciliation

UIX has three layers that can fall out of sync at different times:

1. **Disk** — extension package files.
2. **UIX memory** — currently registered contributions in facet registries.
3. **Pi runtime** — tools, hooks, commands, and other agent behavior registered during the last Pi extension load.

The extension driver reconciles disk to UIX memory by reloading extension packages: clear old extension bags, activate entries again, and let their installers register the current contributions. Registries are the source of truth after activation.

Facet registries that compile to Pi install-time behavior mark the agent install surface dirty when their contributions are registered or unregistered. The dirty marker is not about disk; it means the Pi runtime snapshot no longer matches UIX's in-memory contribution graph. The agent driver must reconcile that by reloading Pi before the next agent turn starts. It may reload earlier when the agent is idle to avoid submit latency, but the invariant is before-turn reconciliation.

Facet registries that are local to UIX do not mark the agent install surface dirty. Their registration disposables and renderer/main notifications are enough.

Renderer reload follows the same registry-source-of-truth rule. The main process owns extension activation and facet registries; the renderer shell does not discover extensions. When UI-visible registries change, main sends the relevant registry snapshot or change payload to the renderer, and React reconciles: unmount removed surfaces, mount new ones, and update changed ones. A full Electron/Vite hot reload is dev tooling, not the UIX extension reload mechanism.

## State-message-local terms

These terms are local to agent-context contributions; do not generalize them across UIX unless another design independently earns them.

### Update buffer

An **update buffer** stores one latest value. The handle method is `update(payload)`.

Semantics:

- retain current truth;
- materialize at agent-run prep;
- compare the materialized `content` to the nearest persisted section on the branch;
- send only when different;
- never drain automatically.

### Append buffer

An **append buffer** stores an ordered pending list. The handle method is `append(payload)`.

Semantics:

- append each payload to pending values;
- materialize the pending list at agent-run prep;
- send when non-empty;
- clear a confirmed batch only after branch persistence proves that exact materialized body was written.

### Materialize

**Materialize** means turning an agent-context contribution's current data into concrete model-visible content.

Default materialization for buffered state messages is JSON:

- update buffer → `JSON.stringify(value)`;
- append buffer → `JSON.stringify(values)`.

A contribution can provide custom `materialize(...)` logic. With no UIX-managed buffer, `materialize()` is required and may read or consume feature-owned stores. The substrate owns delivery/envelope mechanics; the feature owns external store semantics.

## Pi vocabulary boundaries

- **Pi extension**: Pi's factory/API mechanism — a function receives `pi: ExtensionAPI` and registers hooks, tools, commands, providers, messages, or session writes.
- **UIX extension**: a loadable package using `@uix/api` to register UIX contributions.
- **Feature**: the capability bundle, independent of whether it is first-party or packaged.
- **Agent installer**: the internal Pi-facing setup function for a facet or feature side.
- **Contribution**: the UIX-facing registered object accepted by a UIX contribution point.
