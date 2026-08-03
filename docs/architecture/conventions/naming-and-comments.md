---
summary: "UIX code expresses stable domain contracts through canonical identifier grammar, indexable file summaries, caller-facing JSDoc, and risk-based why-comments."
kind: reference
read_when: "Read before introducing or renaming symbols, recurring vocabulary, projections, predicates, source-file summaries, or explanatory comments."
status: active
---

# Naming and comments

## Controlled identifier language

Use these rules for UIX-owned architectural vocabulary.

### naming.term-role: Assign one role to each term

**Rule: must.** Assign one approved meaning and one grammatical role to each UIX-owned architectural term.

**Approved example:** Treat `resolve`, `Resolved`, `register`, and `Registered` as separate terms with separate roles.

**Nonconforming example:** Do not use one term as both a capability noun and an operation verb.

**Reason:** A stable role lets a reader infer how an unfamiliar identifier behaves before the reader opens its definition.

### naming.role-specificity: Choose the defining approved role

**Rule: must.** When one approved noun specializes another and its additional contract applies, use the specialized noun. Choose the role that communicates the strongest stable guarantees consumers can rely on, not the narrowest description of the current implementation.

**Approved examples:** Use `ProviderAuthCatalog`, not `ProviderAuthProjection`, because the value provides a discovery and selection boundary. Use `ToolChatBlockPresentation`, not `ToolChatBlockProjection`, because the value is human-facing material consumed by UI composition.

**Nonconforming example:** Do not call a durable authority `DocumentRegistry` because its implementation uses an in-memory index. Use `DocumentStore` when durability defines the contract.

**Reason:** Broad nouns hide useful guarantees, while implementation-specific nouns become false when mechanics change. The defining approved role preserves the strongest stable contract.

### naming.callable-type: Name a callable type by role

**Rule: must.** Use a noun phrase for a type, interface, class, or named callable type. The head noun of a callable type must identify the callable role.

**Approved examples:**

- `ChannelRequestHandler`
- `ActionContributionRegistrar`
- `ChannelEventPublisher`
- `ActionRunner`

**Nonconforming examples:**

- `HandleChannelRequest`
- `RegisterActionContribution`
- `PublishChannelEvent`
- `RunAction`

Do not disguise an operation as a role suffix. Use `XHandler`, not `XHandle`, for a callback that handles an occurrence. Use `XPublisher`, not `XPublish`. Use `XRunner`, not `XRun`.

### naming.operation: Name an operation with an approved form

**Rule: must.** Use an approved operation form for a UIX-owned function or method.

**Approved example:** Use a verb phrase by default. For example, use `registerAction()`, `publishChannelEvent()`, and `runAction()`. Let a receiver supply established context when the shorter name stays unambiguous:

```ts
actionRegistry.register();
eventPublisher.publish();
```

Use a prepositional form only when the controlled lexicon defines its exact operation meaning. Approved forms include `asRecord()`, `settingsRegistry.forScope()`, and `toUrl()`.

**Nonconforming example:** Do not introduce an unapproved prepositional form. Do not use a noun-only method name for an operation:

```ts
driver.status();
address.url();
pipeline.resourceContributions();
```

### naming.operation-result: Pair transition verbs with result nouns

**Rule: must.** When an operation names a result or lifecycle transition, pair an approved transition verb with the result's domain role. Each term must add independent information.

**Scope:** This rule does not require every operation to repeat its return type. A receiver, input, or established domain operation can already supply the noun, as in `registry.register(action)`.

**Approved examples:** `deriveSelectedBranchProjection()`, `resolveAgentToolContribution()`, and `assembleAgentContextMessage()` pair a transition with its result role. Use `deriveToolChatBlockPresentation()`, where `derive` identifies pure policy computation and `Presentation` identifies the human-facing result.

**Nonconforming example:** Do not verbalize the result noun when that verb adds no transition semantics. `presentToolChatBlock()` restates `ToolChatBlockPresentation`; use `deriveToolChatBlockPresentation()` for a pure rebuildable view.

**Reason:** Controlled verbs collapse synonyms for recurring transitions; controlled nouns collapse synonyms for recurring roles and stages. Keeping those axes orthogonal lets an unfamiliar identifier communicate both facts.

### naming.callable-value: Name a callable by its semantic role

**Rule: must.** Name a callable participant with a noun role. Name an object operation with a verb.

**Approved example:** Use a noun when another operation receives, stores, or registers the callable as a participant:

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

**Nonconforming example:** Do not choose the name from TypeScript method-versus-property syntax. The semantic role controls the name.

### naming.contribution-lifecycle: Name each contribution stage

**Rule: must.** Use the approved lifecycle term for each stage of a contribution.

**Approved example:** Use this sequence, omitting `Normalized` when no canonicalization pass is necessary and introducing `RegisteredX` only when the registry creates a separate live record:

```text
Contribution
→ NormalizedContribution
→ ResolvedContribution
→ RegisteredX (when registry acceptance adds state)
→ CatalogEntry or Projection
```

Name the value returned to the contributor by its capability, such as `Handle`, `Updater`, `Appender`, or `Disposable`. When a registry stores a resolved contribution unchanged, membership expresses liveness: keep the resolved value type and use a container name such as `#registeredTools`. Use a `RegisteredX` type when registry acceptance creates a new record with added registry-owned state, as `RegisteredAction` adds `running`.

Agent context demonstrates both outcomes in one facet:

```text
ResolvedAgentContextUpdateContribution
→ RegisteredAgentContextUpdateContribution (adds hasValue and value)

ResolvedAgentContextAppendContribution
→ RegisteredAgentContextAppendContribution (adds values and inFlight)

ResolvedAgentContextMaterializedContribution
→ registry membership (stored unchanged)
```

**Nonconforming example:** Do not use `Registration` for a registry-ready contribution, a live registered entity, or a returned capability. Do not introduce a `RegisteredX` alias, field-copy interface, or one-field wrapper solely to rename an unchanged resolved shape.

**Reason:** One term for each represented stage lets a reader identify ownership and liveness from the name without creating types that contain no new information.

### naming.qualifier: Add only result-determining qualifiers

**Rule: should.** Omit a prepositional qualifier that only repeats the receiver or parameter role.

**Approved example:** Use `cell.restore(state)`.

**Nonconforming example:** Do not use `cell.restoreFromState(state)` when state is the only accepted source.

**Exceptions:** Add a qualifier when its source identifies a materially different operation:

```ts
cell.restoreFromSnapshot(snapshot);
cell.restoreFromVersion(versionId);
```

### naming.property-access: Distinguish properties from operations

**Rule: must.** Expose a stable property as a readonly property. Name a method with the operation that produces or retrieves its result.

**Approved example:** Use `getStatus()`, `toUrl()`, or `createResourceContributions()` for operations.

**Nonconforming example:** Do not use `status()`, `url()`, or `resourceContributions()` for those operations.

### naming.boolean-predicate: Phrase a Boolean as a claim

**Rule: must.** Name a Boolean variable, field, or function with an approved predicate term that states a truth claim.

**Approved example:** Use `isAgentRunning`, `hasSelection`, `canSwitchSession`, `supportsManualInput`, `shouldRetry`, or `needsReload` according to the approved meanings in the predicate-term table.

**Nonconforming example:** Do not use a bare domain noun such as `agentRunning` or `selection` as a Boolean. Do not use `will` as a general prediction prefix. Use explicit operation state or another approved predicate instead.

**Exceptions:** Use `was` only for captured prior state. Use `did` only for the outcome of an attempted operation.

### naming.boolean-union: Use one status for mutually exclusive states

**Rule: must.** Represent mutually exclusive states with one status or discriminated union instead of multiple Booleans.

**Approved example:**

```ts
status: "idle" | "running" | "failed";
```

**Nonconforming example:**

```ts
isIdle: boolean;
isRunning: boolean;
isFailed: boolean;
```

**Reason:** Independent Booleans can represent impossible combinations.

### naming.react-component: Name a React component with a noun

**Rule: must.** Use a PascalCase noun phrase for a React component.

**Reason:** A component describes rendered content rather than an operation that the caller commands.

### naming.imported-term: Preserve direct external vocabulary

**Rule: may.** An imported term can retain the meaning and grammar of its source API when UIX directly represents the external concept.

**Scope:** This exception applies to terms from Pi, Electron, React, and browser APIs.

**Enforcement:** Record each recurring exception in the imported-terms table.

### Controlled lexicon

#### UIX-owned role terms

| Term (part of speech) | Approved meaning / alternatives | Approved example | Nonconforming example |
| --- | --- | --- | --- |
| `Appender` (noun) | Consumer-held capability that appends values to an ordered pending collection. Use `Updater` when only the latest value remains current. | `AgentContextAppender` | `AgentContextUpdater` for an ordered pending list |
| `Assembler` (noun) | Component that assembles one runtime artifact from multiple registered or materialized parts. Use `Factory` for instance creation and `Projector` for derivation state. | `AgentContextAssembler` | `AgentContextBuilder` |
| `Callback` (noun) | Callable supplied for a continuation or customization point when no more specific role applies. Prefer the specific role when one exists. | `CompletionCallback` | `RequestCallback` for a request handler |
| `Coordinator` (noun) | Substrate-owned, stateful component that sequences a multi-step lifecycle across independently owned participants and performs its side effects. Use `Installer` for setup-time runtime attachment, `Driver` for ownership of a runtime boundary, and `Assembler` for combining parts into one artifact. | `TurnStateCoordinator`; `WorkspaceReloadCoordinator` | `TurnStateCoordinator` for a callable whose only role is installing Pi hooks; use `TurnStateInstaller` |
| `Factory` (noun) | Component or callable that creates domain instances from known inputs and transfers responsibility for them to an owner. Use `Assembler` to combine defined parts into one artifact. | `DocumentStoreFactory` | `AgentContextFactory` for combining registered contributions; use `AgentContextAssembler` |
| `Handle` (noun) | Object that gives its holder a scoped capability. Use `Handler` for a callable that processes an occurrence. | `SettingsHandle` | `ChannelTransportHandle` for a registrar callable |
| `Handler` (noun) | Callable that a framework invokes to process one occurrence and possibly determine its result. Use `Listener` for passive observation. | `ChannelRequestHandler` | `StatusHandler` for a callable that only observes status changes |
| `Installer` (noun) | Setup-time callable or component that attaches a whole feature or facet slice to a runtime. Use `Registrar` for a callable that adds one item. | `AgentInstaller` | `SingleAgentToolInstaller` for a callable that registers one tool; use `AgentToolRegistrar` |
| `Listener` (noun) | Callable that observes an occurrence without determining its result. Use `Handler` when the callable processes the occurrence or supplies its result. | `StatusListener` | `RequestListener` for a callable that must produce the request result |
| `Presentation` (noun) | Purpose-specific human-facing material that forms an explicit intermediate contract between display-policy derivation and UI composition or display execution. A presentation can be a derived projection; use `Projection` when the result remains consumer-neutral domain data, an ordinary UI component when no intermediate contract exists, and `Renderer` for the mechanism that executes web display. | `ToolChatBlockPresentation` | `ToolChatRenderer`; `MessageChatBlockPresentation` for a component with no intermediate presentation value |
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
| `Registered` (adjective) | A separate live record created by registry acceptance with registry-owned state beyond the resolved input. When acceptance stores the resolved value unchanged, keep its `Resolved` type and let membership express liveness. | `RegisteredAction`; `RegisteredAgentContextAppendContribution` | `RegisteredAgentContextMaterializedContribution` with no fields beyond its resolved input |
| `Resolved` (adjective) | Owner-derived identifiers, paths, references, or environment-dependent values are concrete and the value is ready to register. | `ResolvedActionContribution` | `ActionRegistration` for a registry-ready value |

#### UIX-owned operation terms

Use each operation term only for its approved meaning. Do not introduce a synonym when an approved operation already fits.

Use _normalize_ when the result depends only on the input value. Use _resolve_ when ownership, paths, references, or environment can change the result.

For example, `normalizeShortcut()` is context-free. `resolveAgentToolContribution()` derives a concrete Pi tool name for each owning feature.

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
| `derive` (verb) | Compute a new immutable, rebuildable value through filtering, joining, folding, reduction, or domain policy. Use a more specific approved transformation when its boundary applies; otherwise use `derive` for pure policy computation instead of coining a verb from the result noun or return type. | `deriveSelectedBranchProjection()`; `deriveToolChatBlockPresentation()` | `createSelectedBranchProjection()`; `presentToolChatBlock()` |
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
| `Renderer` (noun; browser/Electron) | The web display execution environment or a mechanism that directly manages it. Reserve UIX-owned adoption for substrate display execution; use `Presentation` for human-facing material prepared for that boundary. | `renderer process` | `ToolChatRenderer` |

## Naming

- A `DisposableBag` that owns cleanup capabilities is named after the lifetime it tracks: `appBag`, `windowBag`, `sessionBag`.
- Helpers that register listeners are verb-shaped: `handle`, `onApp`, `onWindow`, `subscribe`. They always return `Disposable`.
- Name symbols for their stable domain role and operation, not their current caller, pipeline position, trigger, owner, or implementation strategy. A name should remain correct if the symbol moves, gains another caller, or changes implementation without changing its essential domain contract. Let the receiver provide context (`turnStateCoordinator.restoreCurrent(...)`); do not repeat that context in every method.
- Function names describe the observable domain operation. Include distinctions that identify materially different operations or results; put lifecycle ordering, current usage, race policy, preconditions, and nuanced skipped outcomes in contract comments. Do not encode those volatile details into a symbol merely because one caller currently depends on them.
- Apply the ambiguity test: if two materially different operations could share a name, it is underspecified. Add the distinguishing domain, result, or resolution axis. Use `enumerateUniqueModifierSequences`, not `permutations`. Use `resolveShortcutForPlatform`, not `resolveShortcut`.
- Domain vocabulary is noun-shaped; operations pair those nouns with the established verbs below. A domain noun keeps one grammatical role across types, values, and function results.
- Parameters name each participant's domain role (`transport`, `contract`, `scope`, `owner`, `session`, `lifetime`, `bag`). Access restrictions live in scoped capability types and handles.
- A domain catalog is `XCatalog`; one public item is `XCatalogEntry`. Reserve these names for the catalog concept in [`concepts.md`](../concepts.md). Do not use them for arbitrary lists or snapshots. Avoid `Descriptor` when the value is a catalog entry.
- State-shape nouns carry these meanings:
  - A **snapshot** is an immutable point-in-time value or independently identified artifact. `toSnapshot()` converts one live value to its snapshot representation; `createDocumentSnapshot()` creates a store-owned artifact; `getCatalogSnapshot()` retrieves an existing current snapshot.
  - A **projection** is a purpose-specific, read-only, lower-information view of authoritative state. It is rebuildable and never independently authoritative; a physically persisted projection has cache semantics. Use `deriveXProjection()` for a one-shot derivation.
  - A **baseline** is the reference value used for comparison by a later operation; it remains derived unless its owning domain commits it.
- React components are the exception: keep PascalCase noun names such as `Conversation` or `ChoiceButton`.
- Add any `Disposable` implementation directly to a bag without another wrapper.
- Use `Store` for durable source-of-truth APIs/implementations. A store may expose a change feed when the change semantics are generic at that layer; otherwise domain-specific buffers/features publish higher-level invalidation events.
- Use `Buffer` for live, feature-specific working projections over a store. Buffers may cache regenerable state, normalize writes, and reconcile feature/editor semantics, but durable authority stays in the backing store.
- Use `Registry` for central in-memory maps of contributed things plus their routing (`ChannelRegistry`, `SettingsRegistry`); registries don't persist.

### Projection naming

Describe a projection through the axes that can change its result. Not every projection uses every axis. Names, parameters, and result fields must let callers predict the view.

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

**Rule:** Outside the required source-file header, a comment explains why code exists or records a non-obvious caller or implementation constraint. It does not narrate syntax. Names carry the stable domain operation.

Contract comments may carry preconditions, skipped outcomes, asynchronous ordering, and race policy. Do not encode those volatile details in a symbol tied to one lifecycle use.

If an implementation comment only identifies an operation or domain value, the name remains wrong. Rename until the code reads on its own.

**No planning artifacts:** Plan phases, stage numbers, ticket ids, and version-zero labels do not belong in code. They lose meaning after the plan changes.

Do not link code comments to dated decisions, design threads, or plans. Their rationale changes independently, which turns each citation into a revalidation cost.

A link to a living convention is the exception. The target tracks a stable rule instead of a point-in-time decision.

**Only stable placement context:** Keep context only when it is necessary for placement and unlikely to change. Omit wiring or caller facts that a reader can rediscover cheaply.

Do not narrate future intentions. They are unverifiable and become stale silently.

**Known invalidation triggers:** An update-trigger comment records an artifact that is complete and correct under present conditions. One known condition will invalidate its current form. The comment does not record unfinished work or a desired future improvement.

Use the exact `Update when:` label, followed by one observable condition and the required code or documentation update. In TypeScript and JavaScript, use the form `// Update when: {condition}. {action}.` Other source formats use their ordinary comment syntax with the same label. Place the comment at the narrowest affected boundary and preserve the current reason separately when the trigger does not explain it.

Before the condition occurs, the marker creates no pending work. Do not use it for speculative refactors, generic TODOs, preferences, plan stages, or ticket ids. Do not link a code marker to a plan; its validity boundary must remain understandable after planning artifacts archive.

**What earns a comment:** Add a warning or explanation that code cannot carry itself. Examples include load-bearing order, external format tolerance, and hidden ownership constraints. Each should prevent a plausible wrong assumption.

**Source-file headers:** Every indexed authored TypeScript and JavaScript file starts with one `//` sentence that states its stable responsibility. Every indexed authored CSS file starts with one single-line `/* */` summary, and every indexed authored HTML file starts with one single-line `<!-- -->` summary. The summary is physically the first line, without exceptions.

JSON, binary assets, and static data are not indexed. A directory `AGENTS.md` or local attribution leaf describes non-code assets when their role is not evident.

Name the domain responsibility, operation, result, or authority boundary. Use the path and filename as existing context instead of repeating them. Distinguish sibling files without enumerating exports, callers, control flow, implementation mechanics, plans, or guessed search synonyms.

The header may continue with one concise `//` paragraph of file-wide context. Preserve hidden guarantees, external constraints, failure boundaries, rationale, and other knowledge that is not cheap or reliable to infer from the implementation. Do not use the paragraph as an export inventory or control-flow narration. If one coherent summary cannot describe the file, reconsider its responsibilities.

A test-file summary states the contract or behavior that the file verifies. A facade or pass-through module states the boundary that it exposes.

**Coverage and depth:** JSDoc coverage follows supported ownership boundaries, not the TypeScript `export` keyword alone. Every supported `@uix/api` contract carries caller-facing JSDoc. An internal export needs JSDoc when correct use or a conceptual relationship is not evident from its name and type.

Complex or edge-case-heavy logic needs denser explanation because wrong assumptions are expensive. Examples include platform quirks, cache semantics, and ordering. Keep UI components, tests, and simple code thin. A file can have no comments beyond its required header when names and types carry the complete story.

**JSDoc:** JSDoc serves code users; line comments serve implementation readers. Write JSDoc as well-formed Markdown.

Use lists instead of compressed prose. Put one tag on each line and indent wrapped tag text. Use single-line `/** ... */` form when it fits.

Write summaries as imperative verb phrases, such as "Resolve the selected branch projection." Do not use the third-person "This method" form.

Do not repeat the name or type in a summary. TypeScript already carries types, so omit them from `@param` and `@returns`.

Use `@param` and `@returns` only when they add information. Reserve `@example` for non-trivial complete code. Use `@link` when a related contract is necessary for correct use and the relationship is not evident from imports and types.

A type or class comment states its role and when to use it, not its fields. Multi-line implementation comments use `//` per line.

In TypeScript and JavaScript, reserve `/* */` for JSDoc and attribution headers.

**Contract nuance lives in JSDoc:** Document defaults, ordering, special values, and edge cases that callers need. State how to use the contract correctly, not how its body works.

**Line comments say why, not what:** An inline comment gives the reason for code, never the narrated step. Useful reasons include format constraints, platform variants, and repository edge cases.

Delete comments such as "increment the counter" or "loop over the entries." The code already states those actions.

**Section titles:** Files longer than roughly 500 lines use `// Section Title` markers at logical group boundaries. Use plain titles without boxed banners.

**Silent catches are labeled:** A `catch` that swallows an error explains why the behavior is safe. Examples include a dead process or broken symlink. An unlabeled swallow reads as a bug.

**Derived code carries attribution:** Code derived from an external source keeps a license or attribution header at the file top. This header is the accepted block-comment exception.
