---
summary: "Canonical UIX concept vocabulary: feature, contribution point, contribution, capability handle, registry, agent facet, assembler, and the state-message-local buffer/materialize terms, with boundaries from pi extension vocabulary."
status: active
---

# Concept vocabulary

This is the canonical vocabulary for UIX architecture discussions and code names. Use it to avoid overloading pi terms and to keep public extension concepts separate from internal substrate wiring.

## Feature

A **feature** is a coherent product/capability bundle: canvas, conversation, a chess board, a file browser, a report renderer. A feature may be first-party in-tree or supplied by a UIX extension package.

A feature is not itself one registration. It may include several pieces:

- UIX contributions, such as panes, commands, state messages, or channel handlers;
- agent facets, such as tools or Pi hooks;
- renderer code, services, stores, styles, and assets.

Use **feature** for UIX capability bundles instead of **extension** unless you specifically mean a loadable UIX package or a Pi extension factory.

## Contribution point

A **contribution point** is a UIX substrate API slot that accepts contributions.

Examples:

- `registerCommand(...)`
- `registerStateMessage(...)`
- future `registerPane(...)`
- future `registerChannelHandler(...)`

A contribution point defines validation, lifetime, ownership, and how registered contributions are later used by the substrate.

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

Do not use **contribution** as a generic synonym for any behavior-changing code. An internal function that calls `pi.registerTool(...)` is an agent facet, not a UIX contribution, unless it is itself registered through a UIX contribution point.

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

## Agent facet

An **agent facet** is an internal Pi-facing side of a UIX feature. It receives Pi's `ExtensionAPI` and affects agent/session behavior.

An agent facet may call Pi APIs such as:

- `pi.registerTool(...)`
- `pi.on(...)`
- `pi.appendEntry(...)`
- `pi.sendMessage(...)`
- `pi.sendUserMessage(...)`

Agent facets are composed inside UIX-core's single in-process Pi extension factory. They are internal substrate wiring, not public UIX extension contributions.

Use **agent facet** instead of **binding** for this role. Pi's **extension** vocabulary still refers to the factory/API mechanism supplied by Pi; UIX **feature** vocabulary refers to capability bundles.

## Assembler

An **assembler** is a substrate-owned pattern for turning many registered contributions into one runtime artifact or hook.

The current example is the state-message assembler:

- reads registered state-message contributions;
- computes the vocabulary section once for a Pi install;
- materializes live contributions while preparing an agent run;
- performs branch comparison and append confirmation;
- assembles one display-hidden `uix.state` custom message;
- installs as an agent facet via Pi's `before_agent_start` hook.

Not every agent facet is an assembler. The canvas tool facet registers tools directly and is not an assembler.

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
- **Agent facet**: the internal Pi-facing part of a feature.
- **Contribution**: the UIX-facing registered object accepted by a UIX contribution point.
