---
summary: "UIX code expresses stable domain contracts through canonical identifier grammar and comments limited to non-obvious rationale and durable constraints."
read_when: "Read before introducing or renaming symbols, recurring vocabulary, projections, predicates, or explanatory comments."
status: active
---

# Naming and comments

## Controlled identifier language

Use these rules for UIX-owned architectural vocabulary.

### naming.term-role — Assign one role to each term

**Rule — MUST.** Assign one approved meaning and one grammatical role to each UIX-owned architectural term.

**Approved example.** Treat `resolve`, `Resolved`, `register`, and `Registered` as separate terms with separate roles.

**Nonconforming example.** Do not use one term as both a capability noun and an operation verb.

**Reason.** A stable role lets a reader infer how an unfamiliar identifier behaves before the reader opens its definition.

### naming.callable-type — Name a callable type by role

**Rule — MUST.** Use a noun phrase for a type, interface, class, or named callable type. The head noun of a callable type must identify the callable role.

**Approved examples.**

- `ChannelRequestHandler`
- `ActionContributionRegistrar`
- `ChannelEventPublisher`
- `ActionRunner`

**Nonconforming examples.**

- `HandleChannelRequest`
- `RegisterActionContribution`
- `PublishChannelEvent`
- `RunAction`

Do not disguise an operation as a role suffix. Use `XHandler`, not `XHandle`, for a callback that handles an occurrence. Use `XPublisher`, not `XPublish`. Use `XRunner`, not `XRun`.

### naming.operation — Name an operation with an approved form

**Rule — MUST.** Use an approved operation form for a UIX-owned function or method.

**Approved example.** Use a verb phrase by default. For example, use `registerAction()`, `publishChannelEvent()`, and `runAction()`. Let a receiver supply established context when the shorter name stays unambiguous:

```ts
actionRegistry.register();
eventPublisher.publish();
```

Use a prepositional form only when the controlled lexicon defines its exact operation meaning. Approved forms include `asRecord()`, `settingsRegistry.forScope()`, and `toUrl()`.

**Nonconforming example.** Do not introduce an unapproved prepositional form. Do not use a noun-only method name for an operation:

```ts
driver.status();
address.url();
pipeline.resourceContributions();
```

### naming.callable-value — Name a callable by its semantic role

**Rule — MUST.** Name a callable participant with a noun role. Name an object operation with a verb.

**Approved example.** Use a noun when another operation receives, stores, or registers the callable as a participant:

```ts
registerChannel(requestHandler);
subscribe(statusListener);
```

Use a verb when invoking the member performs an operation of the object:

```ts
action.run();
surface.render(client);
cell.restore(state);
```

**Nonconforming example.** Do not choose the name from TypeScript method-versus-property syntax. The semantic role controls the name.

### naming.contribution-lifecycle — Name each contribution stage

**Rule — MUST.** Use the approved lifecycle term for each stage of a contribution.

**Approved example.** Use this sequence, omitting `Normalized` when no canonicalization pass is necessary and introducing `RegisteredX` only when the registry creates a separate live record:

```text
Contribution
→ NormalizedContribution
→ ResolvedContribution
→ RegisteredX (when registration adds registry-owned state)
→ CatalogEntry or Projection
```

Name the value returned to the contributor by its capability, such as `Handle`, `Updater`, `Appender`, or `Disposable`. When a registry stores a resolved contribution unchanged, membership expresses liveness: keep the resolved value type and use a container name such as `#registeredTools`. Use a `RegisteredX` type when registration adds state, as `RegisteredAction` adds `running`.

**Nonconforming example.** Do not use `Registration` for a registry-ready contribution, a live registered entity, or a returned capability. Do not introduce a `RegisteredX` alias, field-copy interface, or one-field wrapper solely to rename an unchanged resolved shape.

**Reason.** One term for each represented stage lets a reader identify ownership and liveness from the name without creating types that contain no new information.

### naming.qualifier — Add only result-determining qualifiers

**Rule — SHOULD.** Omit a prepositional qualifier that only repeats the receiver or parameter role.

**Approved example.** Use `cell.restore(state)`.

**Nonconforming example.** Do not use `cell.restoreFromState(state)` when state is the only accepted source.

**Exceptions.** Add a qualifier when its source identifies a materially different operation:

```ts
cell.restoreFromSnapshot(snapshot);
cell.restoreFromVersion(versionId);
```

### naming.property-access — Distinguish properties from operations

**Rule — MUST.** Expose a stable property as a readonly property. Name a method with the operation that produces or retrieves its result.

**Approved example.** Use `getStatus()`, `toUrl()`, or `createResourceContributions()` for operations.

**Nonconforming example.** Do not use `status()`, `url()`, or `resourceContributions()` for those operations.

### naming.boolean-predicate — Phrase a Boolean as a claim

**Rule — MUST.** Name a Boolean variable, field, or function with an approved predicate term that states a truth claim.

**Approved example.** Use `isAgentRunning`, `hasSelection`, `canSwitchSession`, `supportsManualInput`, `shouldRetry`, or `needsReload` according to the approved meanings in the predicate-term table.

**Nonconforming example.** Do not use a bare domain noun such as `agentRunning` or `selection` as a Boolean. Do not use `will` as a general prediction prefix. Use explicit operation state or another approved predicate instead.

**Exceptions.** Use `was` only for captured prior state. Use `did` only for the outcome of an attempted operation.

### naming.boolean-union — Use one status for mutually exclusive states

**Rule — MUST.** Represent mutually exclusive states with one status or discriminated union instead of multiple Booleans.

**Approved example.**

```ts
status: "idle" | "running" | "failed";
```

**Nonconforming example.**

```ts
isIdle: boolean;
isRunning: boolean;
isFailed: boolean;
```

**Reason.** Independent Booleans can represent impossible combinations.

### naming.react-component — Name a React component with a noun

**Rule — MUST.** Use a PascalCase noun phrase for a React component.

**Reason.** A component describes rendered content rather than an operation that the caller commands.

### naming.imported-term — Preserve direct external vocabulary

**Rule — MAY.** An imported term can retain the meaning and grammar of its source API when UIX directly represents the external concept.

**Scope.** This exception applies to terms from Pi, Electron, React, and browser APIs.

**Enforcement.** Record each recurring exception in the imported-terms table.

### Controlled lexicon

#### UIX-owned role terms

| Term (part of speech) | Approved meaning / alternatives | Approved example | Nonconforming example |
| --- | --- | --- | --- |
| `Appender` (noun) | Consumer-held capability that appends values to an ordered pending collection. Use `Updater` when only the latest value remains current. | `AgentContextAppender` | `AgentContextUpdater` for an ordered pending list |
| `Assembler` (noun) | Component that assembles one runtime artifact from multiple registered or materialized parts. Use `Factory` for instance creation and `Projector` for derivation state. | `AgentContextAssembler` | `AgentContextBuilder` |
| `Callback` (noun) | Callable supplied for a continuation or customization point when no more specific role applies. Prefer the specific role when one exists. | `CompletionCallback` | `RequestCallback` for a request handler |
| `Factory` (noun) | Component or callable that creates domain instances from known inputs and transfers responsibility for them to an owner. Use `Assembler` to combine defined parts into one artifact. | `DocumentStoreFactory` | `AgentContextFactory` for combining registered contributions; use `AgentContextAssembler` |
| `Handle` (noun) | Object that gives its holder a scoped capability. Use `Handler` for a callable that processes an occurrence. | `SettingsHandle` | `ChannelTransportHandle` for a registrar callable |
| `Handler` (noun) | Callable that a framework invokes to process one occurrence and possibly determine its result. Use `Listener` for passive observation. | `ChannelRequestHandler` | `StatusHandler` for a callable that only observes status changes |
| `Installer` (noun) | Setup-time callable or component that attaches a whole feature or facet slice to a runtime. Use `Registrar` for a callable that adds one item. | `AgentInstaller` | `SingleAgentToolInstaller` for a callable that registers one tool; use `AgentToolRegistrar` |
| `Listener` (noun) | Callable that observes an occurrence without determining its result. Use `Handler` when the callable processes the occurrence or supplies its result. | `StatusListener` | `RequestListener` for a callable that must produce the request result |
| `Projector` (noun) | Stateful component whose private state exists only to incorporate source facts and derive a projection. Use a `deriveX` function for a one-shot transformation. | `TranscriptProjector` | `ModelCatalogProjector` that only maps one input array; use `deriveModelCatalog()` |
| `Publisher` (noun) | Capability or callable that its holder invokes to publish an event. | `FeatureEventPublisher` | `ChannelTransportPublish` |
| `Registrar` (noun) | Callable that its holder invokes to add an item to a registry or contribution point. Do not use this term for the registered record or returned lifetime capability. | `ActionContributionRegistrar` | `RegisterActionContribution` |
| `Runner` (noun) | Callable that executes an action. | `ActionRunner` | `ActionRun` |
| `Updater` (noun) | Consumer-held capability that replaces the current value or registered contribution after it becomes live. Use `Appender` for an ordered pending collection. | `ActionContributionUpdater` | `ActionContributionHandle` when update is the capability's defining operation |

#### UIX-owned lifecycle terms

| Term (part of speech) | Approved meaning / alternatives | Approved example | Nonconforming example |
| --- | --- | --- | --- |
| `Contribution` (noun) | Declarative value supplied by an author to a contribution point. Use `Installer` for code that directly attaches a whole slice to a runtime. | `ActionContribution` | `AgentInstaller` named as a contribution |
| `Normalized` (adjective) | Converted into one canonical representation without binding live ownership, environment-dependent references, or derived identities. Use `Resolved` after those values become concrete. | `NormalizedResourceRoute` | `NormalizedActionContribution` after owner-derived ids are assigned |
| `Registered` (adjective) | Currently live and owned by a registry. Use `Resolved` for a registry-ready value that is not yet live. | `RegisteredAction` | `RegisteredAction` returned by a resolver before registry acceptance |
| `Resolved` (adjective) | Owner-derived identifiers, paths, references, or environment-dependent values are concrete and the value is ready to register. | `ResolvedActionContribution` | `ActionRegistration` for a registry-ready value |

#### UIX-owned operation terms

Use each operation term only for its approved meaning. Do not introduce a synonym when an approved operation already fits.

Use this decision test: **normalize** when the result depends only on the input value; **resolve** when the same input can produce a different concrete result under a different owner, path, reference context, or environment. For example, `normalizeShortcut()` is context-free, while `resolveAgentToolContribution()` derives a different concrete Pi tool name for each owning feature.

In UIX, `resolve` means contextual or reference resolution, not conflict arbitration. A resolver makes identities and references concrete; the receiving registry rejects collisions instead of selecting a winner.

| Term (part of speech) | Approved meaning / alternatives | Approved example | Nonconforming example |
| --- | --- | --- | --- |
| `as` (preposition) | Refine a value without throwing and return `undefined` when it does not conform. Use `parse` when invalid input throws. | `asRecord(value)` | `parseRecord(value)` for a non-throwing refinement |
| `assemble` (verb) | Combine multiple defined or materialized parts into one runtime artifact. Use `derive` for a projection, `create` for an owned instance, and `build` for compilation. | `assembleAgentContextMessage()` | `buildAgentContextMessage()` |
| `bind` (verb) | Establish a removable or replaceable relationship between independently existing participants. Enroll the relationship in an explicit lifetime. | `bindActionKeyboardDispatcher()` | `createActionKeyboardDispatcher()` when the operation only establishes a relationship |
| `build` (verb) | Compile or bundle source into an executable artifact. Use `create` for an owned instance and `assemble` for defined runtime parts. | `surfacePipeline.buildAll()` | `buildFeatureContext()` |
| `commit` (verb) | Accept validated candidate state into an authority at an explicit boundary. | `commitCurrentTurnState()` | `saveCurrentTurnState()` |
| `create` (verb) | Construct a domain instance or independently identified artifact whose identity, evolving state, or ownership matters. | `createAgentDriver()` | `createSelectedBranchProjection()` for a rebuildable view |
| `decode` (verb) | Apply the reverse half of a reversible representation transform. Use `parse` when the transform is validation without a paired encoding. | `decodeResourceUrl()` | `parseResourceUrl()` when paired with `encodeResourceUrl()` |
| `define` (verb) | Preserve identity or type agreement around public-API plain data without creating a live instance. | `defineSurface()` | `createSurface()` for a plain surface definition |
| `derive` (verb) | Compute a new immutable, rebuildable value through filtering, joining, folding, reduction, or domain policy. | `deriveSelectedBranchProjection()` | `createSelectedBranchProjection()` |
| `encode` (verb) | Apply one half of a reversible representation transform. Use `to` for an ordinary representation without a paired decoder. | `encodeResourceUrl()` | `toResourceUrl()` when a paired decoder defines the representation |
| `enumerate` (verb) | Eagerly derive every member of a finite possibility set. Use `list` to retrieve existing items. | `enumerateUniqueModifierSequences()` | `listUniqueModifierSequences()` when the operation generates possibilities |
| `extract` (verb) | Pull an existing part from a larger value without applying domain reduction policy. Use `derive` when policy computes a new view. | `extractTranscriptText()` | `deriveTranscriptText()` for direct extraction |
| `for` (preposition) | Mint a capability with an owner or address bound into it. Use `get` for an ordinary current-value lookup. | `settingsRegistry.forScope(scopeId)` | `settingsRegistry.getScope(scopeId)` when the result is a newly scoped capability |
| `get` (verb) | Perform a cheap current-value or property lookup without I/O or new authority. Use `read` for I/O and `for` for capability minting. | `driver.getStatus()` | `getSessionSummary()` when the operation reads a file |
| `hydrate` (verb) | Fill defaults into persisted values and validate the result without storing values or registering live behavior. | `hydrateSettings()` | `loadSettings()` for a pure schema pass |
| `install` (verb) | Attach a whole feature or facet slice to a runtime by registering its concrete behavior. Use `register` for one item and `bind` for one removable relationship. | `installProcessHandlers()` | `registerProcessHandlers()` for whole-slice setup |
| `list` (verb) | Retrieve existing items. Use `enumerate` when the operation generates every member of a possibility set. | `listModels()` | `enumerateModels()` for models that already exist |
| `load` (verb) | Turn persisted or external content into its live registered runtime form. A load can contain a read and can have runtime side effects. | `loadFeatures()` | `readFeatures()` when the operation activates them |
| `materialize` (verb) | Turn one abstract, lazy, or buffered contribution into concrete content. Use `assemble` to combine many concrete parts. | `materializeContribution()` | `assembleContribution()` for one contribution |
| `normalize` (verb) | Convert a value into one canonical representation without binding owner-derived identities or environment-dependent references. Use `resolve` when those values become concrete. | `normalizeShortcut()` | `normalizeActionContribution()` when the operation derives owner-scoped ids; use `resolveActionContribution()` |
| `open` (verb) | Start a long-lived stateful object whose lifetime an owner must manage. | `openWorkspace()` | `getWorkspace()` when the operation starts its runtime lifetime |
| `parse` (verb) | Validate unknown or external input into a domain value and throw when it is invalid. Use `as` or `tryParse` for a non-throwing result. | `parseWorkspaceManifest()` | `asWorkspaceManifest()` when invalid input throws |
| `project` (verb) | Incorporate one source fact into a projector's private derivation state. Use `derive` to return the final immutable result. | `projector.projectEntry(entry)` | `const result = projector.project()`; use `deriveSnapshot()` |
| `read` (verb) | Read from disk, a store, a stream, or another I/O-shaped source without creating a live registered runtime. Use `get` for a cheap lookup and `load` for activation. | `readSessionSummary()` | `getSessionSummary()` when the operation reads a file |
| `register` (verb) | Put one item into a registry or contribution point. Use `install` for setup that attaches a whole slice to a runtime. | `actionRegistry.register()` | `installAction()` for one registry item |
| `require` (verb) | Retrieve an expected value and throw when it is absent. Use `get` when absence is an ordinary result. | `requireManifestFeatureEntry()` | `getManifestFeatureEntry()` when absence throws |
| `resolve` (verb) | Make owner-derived identifiers, paths, references, or environment-dependent values concrete. Include an axis when it can produce materially different results. | `resolveActionContribution()`; `resolveAgentToolContribution()`; `resolveShortcutForPlatform()` | `normalizeActionContribution()` after owner-scoped ids are derived |
| `restore` (verb) | Replace live state from previously committed state or a referenced snapshot. Use `set` for an ordinary value replacement. | `cell.restore(state)` | `cell.set(state)` for branch restoration |
| `set` (verb) | Replace an ordinary current value through its owning object. Use `commit` at an authority boundary and `restore` for previously committed state. | `settings.set(key, value)` | `settings.commit(key, value)` for an ordinary replacement |
| `to` (preposition) | Produce a deterministic, side-effect-free representation of the same underlying value. The result has no independent identity. | `toChannelCanonicalId()` | `createChannelCanonicalId()` for a recomputable value |
| `tryParse` (verb) | Attempt to parse input without throwing and return `undefined` when it is invalid. Use `parse` when invalid input throws. | `tryParseShortcut(value)` | `parseShortcut(value)` for a non-throwing attempt |

#### UIX-owned predicate terms

| Term (part of speech) | Approved meaning / alternatives | Approved example | Nonconforming example |
| --- | --- | --- | --- |
| `can` (modal verb) | Context-dependent ability at the current time. Use `supports` for an intrinsic capability. | `canSwitchSession` | `supportsSessionSwitching` when current activity prevents switching |
| `did` (auxiliary verb) | Outcome of an attempted operation. Use only for captured attempt results. | `didCommitState` | `didSupportManualInput` for an intrinsic capability |
| `has` (verb) | Possession, existence, or completed progress. Use `is` for state or classification. | `hasSelection` | `isSelection` for possession of a selection |
| `is` (verb) | Current state, classification, or validation. Use `has` for possession or existence. | `isAgentRunning` | `hasAgentRunning` for current running state |
| `needs` (verb) | Unmet requirement that requires action. Use `should` for a policy or heuristic choice. | `needsReload` | `shouldReload` when correctness requires reload |
| `should` (modal verb) | Policy or heuristic decision. Use `needs` for an unmet requirement. | `shouldRetry` | `needsRetry` when retry is only a policy choice |
| `supports` (verb) | Intrinsic capability independent of current live state. Use `can` for current ability. | `supportsManualInput` | `canUseManualInput` when naming an implementation capability |
| `was` (verb) | Captured prior state. Use only when the value intentionally records an earlier observation. | `wasAgentRunning` | `isAgentRunning` for a captured prior value |

#### Retired terms

| Term (part of speech) | Approved meaning / alternatives | Approved example | Nonconforming example |
| --- | --- | --- | --- |
| `Registration` (noun) | Retired because it named several lifecycle stages. Use `ResolvedXContribution` for registry-ready input, `RegisteredX` for live registry state, and a capability role for the returned value. | `ResolvedActionContribution`; `RegisteredAction` | `ActionRegistration` |

#### Imported terms

| Term (part of speech) | Approved meaning / alternatives | Approved example | Nonconforming example |
| --- | --- | --- | --- |
| `Disposable` (noun; ECMAScript) | Object with deterministic cleanup through `Symbol.dispose`. Use a more specific capability role when cleanup is not its defining operation. | `DisposableBag` | `ActionContributionDisposable` for an update-and-dispose capability |
| `handle` (verb; Electron) | Register an Electron IPC invocation handler. Use UIX-owned role nouns outside a direct representation of that API. | `ipc.handle(...)` | `ChannelRequestContribution.handle` for a stored UIX callback |

## Naming

- A `DisposableBag` that owns registrations is named after the lifetime it tracks: `appBag`, `windowBag`, `sessionBag`.
- Helpers that register listeners are verb-shaped: `handle`, `onApp`, `onWindow`, `subscribe`. They always return `Disposable`.
- Name symbols for their stable domain role and operation, not their current caller, pipeline position, trigger, owner, or implementation strategy. A name should remain correct if the symbol moves, gains another caller, or changes implementation without changing its essential domain contract. Let the receiver provide context (`turnStateLifecycle.restoreCurrent(...)`); do not repeat that context in every method.
- Function names describe the observable domain operation. Include distinctions that identify materially different operations or results; put lifecycle ordering, current usage, race policy, preconditions, and nuanced skipped outcomes in contract comments. Do not encode those volatile details into a symbol merely because one caller currently depends on them.
- Apply the ambiguity test: if two materially different operations could reasonably share the name, it is underspecified. Add the distinguishing domain, result, or resolution axis — `enumerateUniqueModifierSequences`, not `permutations`; `resolveShortcutForPlatform`, not `resolveShortcut`.
- Domain vocabulary is noun-shaped; operations pair those nouns with the established verbs below. A domain noun keeps one grammatical role across types, values, and function results.
- Parameters name each participant's domain role (`transport`, `contract`, `scope`, `owner`, `session`, `lifetime`, `bag`). Access restrictions live in scoped capability types and handles.
- A domain catalog is `XCatalog`; one public item is `XCatalogEntry`. Reserve these names for the catalog concept defined in [concepts](../concepts.md), not arbitrary lists or snapshots; avoid the generic `Descriptor` suffix when the value's actual role is a catalog entry.
- State-shape nouns carry these meanings:
  - A **snapshot** is an immutable point-in-time value or independently identified artifact. `toSnapshot()` converts one live value to its snapshot representation; `createDocumentSnapshot()` creates a store-owned artifact; `getCatalogSnapshot()` retrieves an existing current snapshot.
  - A **projection** is a purpose-specific, read-only, lower-information view of authoritative state. It is rebuildable and never independently authoritative; a physically persisted projection has cache semantics. Use `deriveXProjection()` for a one-shot derivation.
  - A **baseline** is the reference value used for comparison by a later operation; it remains derived unless its owning domain commits it.
- React components are the exception: keep PascalCase noun names such as `Conversation` or `ChoiceButton`.
- Anything implementing `Disposable` is fine to add to a bag — no ceremony needed.
- Use `Store` for durable source-of-truth APIs/implementations. A store may expose a change feed when the change semantics are generic at that layer; otherwise domain-specific buffers/features publish higher-level invalidation events.
- Use `Buffer` for live, feature-specific working projections over a store. Buffers may cache regenerable state, normalize writes, and reconcile feature/editor semantics, but durable authority stays in the backing store.
- Use `Registry` for central in-memory maps of contributed things plus their routing (`ChannelRegistry`, `SettingsRegistry`); registries don't persist.

### Projection naming

Describe a projection along the axes that determine materially different results. Not every projection uses every axis, and a symbol need not repeat facts intrinsic to its domain, but its names, parameters, and result fields together must let a caller predict the view.

| Axis | Question | Naming pattern |
| --- | --- | --- |
| **Sources** | Which authoritative inputs are viewed? | Name the domain sources in the projection or its parameters. |
| **Viewpoint** | From which contextual coordinate are the sources interpreted? | `AsOfX` for a position in ordered history; `ForX` for an observer or environment. |
| **Selection** | Which source facts participate? | Use domain qualifiers such as `active`, `visible`, `offered`, or `unresolved`. |
| **Correlation** | How are facts from different sources or positions joined? | `ByX` names a lookup or join key (`bindingByActionId`, `resultByToolCallId`). |
| **Partition** | Which groups are reduced independently? | `PerX` names the partition (`latestValuePerCell`, `claimantsPerShortcut`). |
| **Reduction** | How does each partition become a result? | Name the policy before the partition: `latestValuePerCell`, `countPerStatus`, `averageLatencyPerWindow`. |
| **Result shape** | What consumer-facing view is produced? | Use the domain noun: `TranscriptSnapshot`, `ActionBindingProjection`, `ProviderAuthCatalog`. |

A **projector** is the stateful derivation component used when cross-entry correlation or one shared source traversal requires incremental state. Name its factory `createXProjector`; `projectX(...)` incorporates one source fact into private derivation state; a receiver-qualified `deriveX()` returns the immutable result. For example:

```ts
const transcriptProjector = createTranscriptProjector();
const registrySnapshot = toTurnStateRegistrySnapshot(registry);
const turnStateProjector = createTurnStateProjector(registrySnapshot);

for (const entry of branch) {
  transcriptProjector.projectEntry(entry);
  turnStateProjector.projectEntry(entry);
}

return {
  transcript: transcriptProjector.deriveSnapshot(),
  turnStateAsOfLeaf: turnStateProjector.deriveAsOfLeaf(),
};
```

Current projections apply the axes as follows:

| Projection | Viewpoint | Selection / correlation | Partition / reduction | Result |
| --- | --- | --- | --- | --- |
| Selected branch | `asOfLeaf` | Displayable messages; registered turn-state cells; tool results joined by tool-call id | Ordered transcript; latest value per cell | `SelectedBranchProjection` with `transcript` and `turnStateAsOfLeaf.latestValuePerCell` |
| Action bindings | `forPlatform` | Active actions joined to confirmed bindings by action id; inactive bindings split out as unresolved | Conflict claimants collected per resolved shortcut | `ActionBindingProjection` |
| Provider authentication | current `ModelRuntime` | Interactive provider-owned login methods joined with non-secret connection status | Connected providers ranked before remaining provider names | `ProviderAuthCatalog` |
| Canvas anchors | `asOfDocumentVersion` or current working content | Addressable text joined to retained anchor identity | Anchor continuity reconciled per document and line | `AnchoredDocument` working projection |

## Comments

**Rule.** A comment explains _why_ code exists or records non-obvious contract constraints; it does not narrate syntax. Names carry the stable domain operation. Contract comments may carry preconditions, skipped outcomes, asynchronous ordering, and race policy when putting those volatile details in the symbol would couple callers to one lifecycle use. If a comment is needed merely to identify the operation or domain value, that is still a naming problem — rename until the code reads on its own.

**No planning artifacts.** Plan phases (`C3`), stage numbers, ticket ids, `v0` — none belong in code. They are a parallel vocabulary that means nothing to a later reader and goes stale the moment the plan moves on. The same applies to links to dated decision/design/plan docs: the rationale they hold churns independently of the code, so a citation becomes a re-validation cost (open the doc, check it still applies) rather than a help. A pointer to a living style doc (this file) is the exception — it tracks a stable convention, not a point-in-time decision.

**Only stable placement context.** Keep a comment only when its context is both (a) necessary to place the code in the system and (b) unlikely to change across revisions. If a reader could rediscover the context ad-hoc — who calls this, how it is wired — leave it out; rediscovery is cheaper than keeping a comment honest. Comments that narrate _future_ intentions ("a `diff` method joins here when versioning lands") are the most expensive kind: unverifiable, and they rot silently.

**What earns a comment.** A warning or an explanation the code cannot carry itself: "this must not move or the session file is orphaned," "read defensively because pi may add block kinds," "order is load-bearing — pi has no priority field." Each saves a reader from a wrong assumption.
