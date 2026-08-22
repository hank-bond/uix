---
summary: "Canonical UIX vocabulary for feature lifecycles, contributions, state roles, runtime coordination, and boundaries from Pi terminology."
kind: reference
---

# Concept vocabulary

This is the canonical vocabulary for UIX architecture discussions and code names. Use it to avoid overloading Pi terms and to distinguish feature loading, package distribution, and internal substrate wiring.

## Host, supervisor, and workspace runtime

A _host_ owns the process and platform integration: lifecycle, transports, native capabilities, and workspace supervision. Electron and the local server are hosts. A _client bootstrap_ is a host's page entry that constructs the transport client and mounts the shared client.

The _supervisor_ is the host-internal component that supervises and routes requests to workspace runtimes. It maps workspace ids to workspace handles, coalesces runtime boots, and decides process placement. A _workspace handle_ is the host-facing handle to one in-process workspace runtime.

A workspace runtime's _dependencies_ are the concrete effects it requires from the host, injected at construction. A runtime declares them, and the host provides them. An _adapter_ is a translator across communication capabilities.

The _launcher_ is the shared pre-workspace client that selects or creates workspaces over host capability endpoints. A _native launcher_ is an external client, such as the macOS menu-bar app, that consumes the same host endpoints. A host can serve the launcher with zero active workspace runtimes.

## Feature

A _feature_ is UIX's loadable unit and the coherent capability it adds: Canvas, Chat, a chess board, a file browser, or a report renderer. A feature can be first-party in-tree or provided by another manifest-referenced module.

A _feature entry_ is the concrete TypeScript or JavaScript module referenced by one ordered `uix.workspace.json` manifest entry. It exports `feature`, one `FeatureDefinition`. Activation of that definition produces one activated feature instance. UIX does not auto-discover feature entries.

A package is only a code-distribution and dependency boundary. It can contain feature entry modules, Pi extensions, or both, but it does not introduce a UIX lifecycle layer above features. The workspace manifest explicitly selects its UIX feature entries.

A feature is not itself one registered item. It may include several pieces:

- UIX contributions, such as surfaces, actions, state sections, or channel handlers.
- Agent installers, such as code that registers tools or Pi hooks.
- Renderer code, services, stores, styles, and assets.

Use **feature** for the UIX capability, loadable definition, and activation boundary. Use **package** only for distribution or dependency ownership. Use **extension** only for Pi's extension mechanism.

## Feature lifecycle

A _feature definition_ is the plain `FeatureDefinition` exported by one manifest entry module. It declares the feature id and optional `workspace(ctx)` and `agent(ctx)` factories. It is not itself live state.

_Feature activation_ validates a definition and settings, runs its Workspace factory, and retains its Agent factory in manifest order. It registers the Workspace result under a provisional lifetime bag. Only complete success enrolls that bag.

An _activated Workspace feature_ is the live result of one successful Workspace activation: its local values, registered contributions, retained Agent factory, and per-feature lifetime bag. An _Agent feature instance_ is the result of calling that Agent factory for one `AgentInstance`. It has its own local values, registrations, and feature bag. A failed factory removes that feature's partial work without stopping siblings.

The _active feature composition_ is the set of activated Workspace features and the corresponding Agent feature instances. Reload rejects during an active turn or Agent feature-channel operation. An idle reload commits every viewpoint, replaces Workspace features, rebuilds each live Agent feature bag, reloads initialized Pi runtimes, and restores each viewpoint. Cleanup failures are reported after forward replacement reaches a coherent state.

Do not call an activated feature instance a feature generation. Use _generation_ only for a modeled replaceable object graph, such as a staged manifest or Pi runtime. Feature lifecycle uses activation, instance, active composition, and replacement instance.

## Identifier grammar

UIX uses two id grammars for different things.

**The facets derive contribution ids**, never hand-authored. A feature author gives a local `name`. The facet derives two ids:

- **`ContributionId`:** The registry dedup key. One uniform brand across all facets, constructed by `toContributionId(featureId, facet, name)` → `${featureId}.<facet>.<name>`. Examples: `canvas.channel.writeback`, `canvas.agent.anchor_read`, `canvas.agent-context.canvas-diff`, `canvas.turn-state.documents`.
- **`…CanonicalId`:** The downstream-system address, such as a transport channel, Pi tool name, resource key, persisted section, or storage key. Each facet has one brand because downstream naming differs. The facet segment drops from the canonical id because the downstream system already implies the kind. Examples include `canvas.writeback`, `canvas__anchor_read`, and `canvas-doc`.

Validated helpers construct both nominal brands. Internal registry sets and resolved contribution shapes retain those brands. External string boundaries cast inline.

Author-facing `@uix/api` contributions contain local names instead of derived ids. `packages/api/src/contribution-id.ts` owns the cross-facet grammar.

Each consumer owns its canonical-id helpers and resolved shapes. Shared channel and resource resolution lives in `packages/api/src/`. Main-only facets keep resolution in `src/main/`.

Envelope and customType ids stay substrate-owned and are not feature-scoped: `uix.state` (the display-hidden agent-context envelope), `uix.turn-state` (the persisted turn-state entry). Inner contributions use feature-scoped canonical ids: `<canvas.canvas-diff>` inside `<uix-state>`, or `canvas.documents` as a named cell inside a `uix.turn-state` entry.

The emitting substrate facet defines event payload shapes. If a pane-originated write causes a document event, `sourceId: "canvas.pane.writeback"` is provenance, but the payload is still the document facet's `DocumentWriteEvent` shape. A contribution in one facet may call another facet. `eventType`/channel tells you what happened, and `sourceId` tells you which contribution caused it.

_Resource ids_ name addressable things. `doc://canvas/main` names a managed Canvas document. A future `workspace://src/main.ts` id can name a file relative to the recorded working directory.

Facet organization does not appear in resource paths. A surface, agent tool, snapshot, and restore coordinator can all reference the same resource.

A resource declaration's `origin` policy partitions the browser origin. `origin: "feature"` puts the feature id in the URL host so Chromium isolates the resource from the workspace. `origin: "workspace"` keeps the workspace origin and places feature identity in the path. `toOrigin()` returns that exact origin for `postMessage` security checks. The `uix-resource` scheme is a transport/permission class, not a semantic document type, so browser fetch origins stay separate from domain ids such as `doc://canvas/main`.

Use `uix.*` only for substrate-owned dotted ids (envelopes/customTypes). First-party default features are still features, so their contribution ids use feature namespaces such as `canvas.*` and `chat.*`.

## Contribution point

A _contribution point_ is a UIX substrate API slot that accepts contributions.

Examples:

- The `WorkspaceFeatureContributions.channels` facet.
- The `AgentFeatureContributions.agentContext` facet.
- The `WorkspaceFeatureContributions.surfaces` facet.
- The surface-scoped `useActionContribution(...)` hook.

A contribution point defines validation, lifetime, ownership, and how registered contributions are later used by the substrate.

## Contribution lifecycle

A feature authors a _contribution_. A facet can **normalize** it into one canonical representation when necessary. The facet then **resolves** owner-derived identifiers, paths, references, and environment-dependent values before it asks the registry to accept the result. A _registered_ entity is live and owned by that registry. When registry acceptance adds registry-owned state, a separate `RegisteredX` record represents that state. When the registry stores the resolved contribution unchanged, membership expresses liveness and no additional lifecycle type is necessary. A catalog entry or other projection can expose a read-only consumer view without exposing executable references.

```text
Contribution
→ NormalizedContribution
→ ResolvedContribution
→ RegisteredX (when registry acceptance adds state)
→ CatalogEntry or Projection
```

The `Normalized` stage and a separate `RegisteredX` shape are optional. Registering returns a `Disposable` or a specific capability such as an updater.

Registering answers: what one concrete item became live? Installing answers: how does a whole slice attach to the system?

A registered callback at a lifecycle point is a hook. For example, `pi.on("input", handler)` registers an `input` hook.

## Contribution

A _contribution_ is a declarative capability or state value that a feature provides to a UIX contribution point. The substrate owns it after registration.

A contribution must be:

- **owned by one feature:** One feature is responsible for its identity, schema, materialization/rendering contract, and disposal.
- **registered at a contribution point:** It enters UIX through a `register*` API rather than by importing host internals.
- **lifetime-scoped by the substrate:** Disposal/unload removes it from the registry.
- **described by what it offers, not by how a downstream consumer happens to use it**.

Examples:

- An action contribution describes a human-invokable renderer workflow.
- An agent-context contribution describes one model-visible state section.
- A surface contribution identifies a mountable frontend module.
- A channel contribution describes typed backend requests and events.

Do not use **contribution** as a generic synonym for any behavior-changing code. An internal function that calls `pi.registerTool(...)` is an agent installer, not a UIX contribution, unless it is itself registered through a UIX contribution point.

## Capability handle

A _capability handle_ is an object that gives its holder scoped operations without exposing the underlying owner. A register operation can return a more specific capability after a contribution becomes live.

Examples:

- An agent-context update contribution returns an `AgentContextUpdater` with `update(payload)`.
- An agent-context append contribution returns an `AgentContextAppender` with `append(payload)`.
- A `ResourceAddressHandle` provides resource-scoped `toUrl()` and `toOrigin()` conversions.
- Many contribution points return only a `Disposable` because the contributor needs no further operation.

A capability belongs to its holder. It should not become a shared stringly API for other features to drive.

## Registry

A _registry_ is the substrate-owned collection of currently registered contributions for one contribution point.

A registry is working memory, not durable authority. Durable state lives in Pi session entries, content stores, or other explicitly owned stores. The registry answers: what contributions are live right now?

A registry is not a `DisposableBag`. The registry owns its live index and invariants, such as duplicate-id checks. The returned `Disposable` removes one contribution.

A caller-owned bag decides when removal occurs. Feature activation uses its instance bag, while substrate wiring selects a bag matching its own lifetime.

## Catalog

A _catalog_ is a consumer-facing, read-only discovery boundary that composes currently offered capabilities from multiple owners or authoritative sources. Catalog entries have stable identities, are serializable, contain no executable references, and may include derived presentation or eligibility state. Operations by catalog-entry id resolve against current live authority. The catalog itself owns neither the capabilities nor their durable state.

A catalog is not any array, registry snapshot, or entity collection. It intentionally composes multiple owners for discovery and selection.

The action catalog projects live actions for menus and palettes while callbacks remain private. Updates and disposal change membership. Invocation still resolves through `ActionRegistry`.

The model catalog composes available Pi models and workspace favorite state. Selection resolves a provider-qualified entry against Pi's live model runtime.

The provider-auth catalog projects interactive login methods and non-secret status. Flow operations preserve backend provider ids. Feature presentation may group rows without changing those identities.

A future settings catalog can compose editable values without exposing owner-scoped settings handles.

## Snapshot

A _snapshot_ is an immutable point-in-time value or independently identified artifact. It captures one authority's state without assigning that value a position in a broader history. Snapshots may be transient, store-owned and durable, or current read models published to consumers. The owning domain determines retention. Examples include a `DocumentVersion`, `AnchoredDocumentSnapshot`, `TranscriptSnapshot`, and an action registry's current catalog snapshot.

## Projection

A _projection_ is a purpose-specific, read-only, lower-information view derived from authoritative state. It may select, join, partition, reduce, classify, or add derived fields, but it remains rebuildable and is not a write surface back to the authority. A projection may be cached or physically persisted with cache semantics.

A projection's **viewpoint** is the contextual coordinate from which its sources are interpreted. A viewpoint may identify a position in ordered history (`asOfLeaf`), an observer environment (`forPlatform`), or another result-determining context. Selection, correlation, partition, and reduction describe how source facts become the result. These policies are independent of the viewpoint.

Examples include a selected-branch transcript and turn state at that branch's leaf. Another example joins private actions with confirmed platform bindings into catalog entries.

## Projector

A _projector_ is a stateful derivation component that incorporates source facts while producing a projection. Its mutable state belongs only to the derivation. It is neither authority nor a write surface back to the source. A projector uses `projectX(...)` to incorporate one source fact and a `deriveX(...)` method to return an immutable result. Multiple projectors may share one source traversal, as the transcript and turn-state projectors do while deriving a selected-branch projection.

Use a projector when cross-fact correlation or a shared traversal requires stateful incremental derivation. A one-shot value transformation remains a `deriveXProjection(...)` function rather than gaining a projector object.

## Store

A _store_ is a durable source-of-truth API or implementation for a state domain. It owns that domain's persistence semantics. The interface hides local files or another backing implementation. Callers address values by stable ids, not implementation paths.

A store may expose a change feed when its layer owns generic change semantics. Otherwise, the feature or buffer publishes a domain-specific invalidation event.

`DocumentStore` persists bytes and versions without emitting Canvas refresh events. Agent factories receive document stores whose mutable current bytes are scoped to their viewpoint while immutable versions remain shared. Canvas publishes `canvas.changed` when an Agent write should refresh its iframe.

## Buffer

A _buffer_ is a live, feature-specific working projection over a store. It may cache regenerable session state, normalize or validate writes, reconcile editor state, and translate between feature semantics and the store's generic durable shape.

A buffer is not durable authority. It persists snapshots through its backing store and rebuilds from durable state when needed. Each `CanvasDocumentBuffer` keeps one Agent viewpoint's HTML and anchored document projections. `DocumentStore` owns the immutable versions referenced by Canvas turn state.

## Controller

A _controller_ is a renderer-owned, framework-independent state owner for one interactive domain. It translates intent into backend requests and consumes authoritative responses and events.

The controller coordinates in-flight operations, rejects stale results, and publishes an immutable snapshot with narrow capabilities. React can adapt this API into context. Rendering and context lifetime remain separate.

A controller owns the renderer projection, not durable domain state. It does not persist data, own an external runtime, or coordinate registered contributions.

Keep ordinary component-local state in React. Use a controller when multiple consumers must share one ordered interaction protocol.

`WorkspaceSessionController` coordinates session projections, agent activity, mutations, and stale-result versions. Main and Pi remain authoritative for durable session graphs.

## Sessions, attachments, and agent instances

A _session_ is a durable conversation tree. An _agent instance_ is the lifecycle owner for one Pi execution at an immutable session-branch viewpoint. It immediately owns one independent `SessionManager`, Agent facet registries, Agent feature instances, transcript observation, ephemeral transcript identity, current-model projection, and a turn-state coordinator. Its `AgentSessionRuntime` boots lazily only when execution requires it. Connections on one session share those feature instances. Different sessions do not.

An `AgentInstanceSupervisor` owns the live instances for one workspace runtime. The current policy keys one primary instance by session id, single-flights concurrent creation, and issues independent _guards_. A guard prevents teardown while its holder uses the instance. Disposing one guard is synchronous and affects no peer. Zero guards admits supervisor teardown policy rather than promising teardown to the disposer.

A connection's _attachment_ is its runtime-created, retargetable capability. It owns one target guard, request authority, event observation, and disposal. Prepared requests and running turns retain independent guards, so accepted work can outlive attachment retarget or closure. A successful retarget acquires the new instance before releasing the old target guard.

UIX persists no workspace-global selected session. The current one-window Electron composition creates an attachment without an explicit target, so the runtime resolves the newest valid session or creates one. Canonical workspace-session browser URLs and per-window target restoration are not implemented.

Use _fallback_ only for resolving an attachment request that omits a session, _target_ for one attachment's session, and _active_ for a runtime or renderer projection.

## Facet

A _facet_ is a coherent slice of behavior we try to keep self-contained and discrete. It is a conceptual boundary, not necessarily one file, one class, or one registered item.

Examples:

- State management.
- State messages.
- Surface composition.
- Channels.
- Transcript identity.
- The agent-facing side of a feature.

A feature may participate in many facets. Canvas contributes a surface, Agent tools, turn-state snapshots, model-visible context, and selected-viewpoint channels.

Use **facet** for the behavioral slice. Use **feature** for the loadable product/capability bundle that participates in those facets.

## Installer

An _installer_ is setup-time code that attaches a facet or feature side to a runtime by registering concrete pieces of behavior.

An installer may register:

- Tools.
- Hooks.
- Commands.
- IPC handlers.
- Electron protocols.
- UIX contributions.

Installers answer: how does this slice attach to the system? A register operation answers: what one concrete item became live?

An _agent installer_ is the Pi-facing installer shape: it receives Pi's `ExtensionAPI` and registers behavior that affects the agent/session runtime. Agent installers may call Pi APIs such as:

- `pi.registerTool(...)`
- `pi.on(...)`
- `pi.appendEntry(...)`
- `pi.sendMessage(...)`
- `pi.sendUserMessage(...)`

UIX-core composes agent installers inside its single in-process Pi extension factory. They are internal substrate wiring, not feature contributions.

## Driver

A _driver_ owns a runtime or lifecycle boundary. It creates the relevant lifetime bags, attaches behavior, orders teardown and reload, and exposes a small control surface.

The former selected-session agent driver no longer exists. Its responsibilities are split across `WorkspaceAgentRuntime`, `AgentInstanceSupervisor`, and `AgentInstance`: workspace-shared provider services, keyed instance lifecycle, and one session-viewpoint Pi execution respectively. The feature loader owns manifest composition, per-entry bags, injected API construction, activated feature instance creation, reload/error isolation, and teardown of registered contributions.

Exclusive owners use bags for registrations and unique children. Supervisors issue guards for independently held shared children. Installers register behavior, registries track live contributions, bags order exclusive cleanup, and guards prevent supervised teardown during shared use.

## Hook

A _hook_ is a callback registered at a named lifecycle point.

Examples:

- `pi.on("input", handler)` registers an `input` hook.
- `pi.on("before_agent_start", handler)` registers a `before_agent_start` hook.
- `pi.on("agent_end", handler)` registers an `agent_end` hook.

Installers register hooks. Hooks run later when the lifecycle event occurs.

## Coordinator

A _coordinator_ is a substrate-owned, stateful component that sequences a multi-step lifecycle across independently owned participants and performs the side effects for that lifecycle. Participants can be registered contributions, generations, stores, or external callbacks. The coordinator owns their workflow, not their underlying authority.

The turn-state coordinator works across registered state cells:

- Asks live named state cells for complete snapshots before user submit and at `agent_end`.
- Validates each plain-JSON snapshot against its TypeBox schema.
- Compares each cell independently with the selected branch.
- Commits changed snapshots in one `uix.turn-state` session entry.

`ProviderAuthFlowCoordinator` sequences one Pi-owned login flow across prompts, notices, link opening, answers, and cancellation. `WorkspaceReloadCoordinator` serializes candidate adoption, feature replacement, state restoration, and surface publication without taking ownership of those underlying authorities.

A coordinator owns timing, in-flight workflow state, and cross-participant mechanics. Each participant retains authority. Features own cell behavior, Pi owns authentication, and the loader owns active feature instances.

## Assembler

An _assembler_ is a substrate-owned pattern for turning many registered contributions into one artifact or hook result.

The current example is the agent-context assembler:

- Reads registered agent-context contributions.
- Computes the vocabulary section once for a Pi install.
- Materializes live contributions while preparing an agent run.
- Performs branch comparison and append confirmation.
- Assembles one display-hidden `uix.state` custom message.
- Installs a Pi `before_agent_start` hook through an agent installer.

Coordinators and assemblers are both cross-contribution substrate patterns. A coordinator emphasizes lifecycle orchestration and side effects. An assembler emphasizes building one combined artifact from many contributions.

## Reload reconciliation

UIX has three layers that can fall out of sync at different times:

1. **Disk:** feature entry and dependency files.
2. **UIX memory:** currently registered contributions in facet registries.
3. **Pi runtime:** tools, hooks, commands, and other agent behavior registered during the last Pi extension load.

The feature loader reconciles disk to UIX memory by disposing the active composition and activating each accepted manifest entry. Replacement instances register their contributions. Registries become authoritative after activation.

Agent-facing registries become a Pi runtime snapshot when an instance's Pi runtime starts or reloads. Workspace reload replaces feature contributions, then visits every live agent instance under a temporary guard and reloads each initialized Pi runtime. UIX does not maintain a separate automatic dirty-marker path.

Facets local to UIX reconcile through returned disposables and renderer or main notifications. They do not require Pi reload.

Renderer reload follows the same registry-authority rule. Main owns feature activation and facet registries. The renderer does not load feature definitions.

When visible registries change, main notifies the renderer. React unmounts removed surfaces, mounts additions, and updates changed surfaces.

Electron and Vite hot reload remain development tools, not the UIX feature reload mechanism.

## Agent-context-local terms

These terms belong to agent-context contributions. Do not generalize them across UIX unless another design independently earns them.

### Update buffer

An _update buffer_ stores one latest value. The handle method is `update(payload)`.

Semantics:

- Retain current truth.
- Materialize at agent-run prep.
- Compare the materialized `content` to the nearest persisted section on the branch.
- Send only when different.
- Never drain automatically.

### Append buffer

An _append buffer_ stores an ordered pending list. The handle method is `append(payload)`.

Semantics:

- Append each payload to pending values.
- Materialize the pending list at agent-run prep.
- Send when non-empty.
- Clear a confirmed batch only after branch persistence proves it wrote that exact materialized body.

### Materialize

**Materialize** means turning an agent-context contribution's current data into concrete model-visible content.

Default materialization for buffered state messages is JSON:

- Update buffer → `JSON.stringify(value)`.
- Append buffer → `JSON.stringify(values)`.

A contribution can provide custom `materialize(...)` logic. With no UIX-managed buffer, `materialize()` is required and may read or consume feature-owned stores. The substrate owns delivery/envelope mechanics. The feature owns external store semantics.

## Pi vocabulary boundaries

- **Pi extension:** Pi's factory and API mechanism. A function receives `pi: ExtensionAPI` and registers hooks, tools, commands, providers, messages, or session writes.
- **Feature**: UIX's manifest-selected loadable definition and capability bundle.
- **Package**: an optional distribution and dependency boundary, not a UIX lifecycle unit.
- **Agent installer**: the internal Pi-facing setup function for a facet or feature side.
- **Contribution**: the UIX-facing declarative value accepted by a UIX contribution point.
