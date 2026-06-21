---
summary: "Canonical UIX concept vocabulary: feature, facet, installer, driver, hook, contribution point, contribution, capability handle, registry, coordinator, assembler, reload reconciliation, and state-message-local terms, with boundaries from pi extension vocabulary."
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

**Dotted ids** name owners, facets, contributions, kinds, sources, messages, and actions:

```text
<owner>.<facet>[.<capability-or-action>...]
```

`owner` is either a feature id (`canvas`, `chat`, `acme.report`) or `uix` for substrate-owned ids. The next segment is usually the facet or surface being contributed to (`pane`, `agent`, `document`, `state`, `channel`, `command`). Later segments are facet-local stable names, not throwaway strings. Examples: `canvas.state`, `canvas.document.html`, `canvas.pane.writeback`, `canvas.agent.anchor_edit`, `uix.document.restore`, `uix.turn-state`.

**Resource ids** name addressable things. URI schemes identify substrate resource managers: `doc://canvas/main` is a document-engine resource in the canvas namespace; `workspace://src/main.ts` is a workspace file interpreted relative to the turn's recorded cwd. Feature/facet organization does not appear inside resource paths — the same resource may be read by a pane, edited by an agent tool, snapshotted by state, and restored by the coordinator.

Use `uix.*` only for substrate-owned dotted ids. Bundled default features are still features, so their ids use feature namespaces such as `canvas.*` and `chat.*`.

## Contribution point

A **contribution point** is a UIX substrate API slot that accepts contributions.

Examples:

- `registerCommand(...)`
- `registerStateMessage(...)`
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
- a state-message contribution describes one model-visible state section;
- a future pane contribution describes a mountable surface;
- a future channel-handler contribution describes a typed pane→main message handler.

Do not use **contribution** as a generic synonym for any behavior-changing code. An internal function that calls `pi.registerTool(...)` is an agent installer, not a UIX contribution, unless it is itself registered through a UIX contribution point.

## Capability handle

A **capability handle** is the value returned by a registration when the contributor needs an imperative capability after registration.

Examples:

- a state-message update contribution returns a handle with `update(payload)`;
- a state-message append contribution returns a handle with `append(payload)`;
- many contribution points return no handle because the registered object already contains the needed callbacks.

A handle belongs to the registering feature. It should not become a shared stringly API for other features to drive.

## Registry

A **registry** is the substrate-owned collection of currently registered contributions for one contribution point.

A registry is working memory, not durable authority. Durable state lives in Pi session entries, content stores, or other explicitly owned stores. The registry answers: what contributions are live right now?

A registry is not a `DisposableBag`. The registry owns the live contribution index and invariants such as duplicate-id checks; the `Disposable` returned by `register(...)` removes that one contribution; a caller-owned bag decides when that removal happens. Hosted extension APIs should auto-scope registration disposables to the extension's lifetime bag, and first-party wiring should add registration disposables to an explicit bag when the contribution lifetime is shorter than the app.

## Facet

A **facet** is a coherent slice of behavior we try to keep self-contained and discrete. It is a conceptual boundary, not necessarily one file, one class, or one registration.

Examples:

- state management;
- state messages;
- pane hosting;
- channels;
- transcript identity;
- the agent-facing side of a feature.

A feature may participate in many facets. For example, a canvas feature can contribute a pane to the pane-hosting facet, tools to the agent/tooling facet, private snapshots to the state-management facet, and model-visible sections to the state-message facet.

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

The current example is the private state coordinator:

- installs Pi `input` and `agent_end` hooks;
- asks live state contributions to prepare private turn state;
- persists contribution-keyed opaque refs;
- appends one `uix.turn-state` session entry when there is state to persist.

A coordinator owns timing and cross-contribution mechanics. The contributing feature owns the data it prepares.

## Assembler

An **assembler** is a substrate-owned pattern for turning many registered contributions into one runtime artifact or hook result.

The current example is the state-message assembler:

- reads registered state-message contributions;
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

These terms are local to state-message contributions; do not generalize them across UIX unless another design independently earns them.

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

**Materialize** means turning a state-message contribution's current data into concrete model-visible content.

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
