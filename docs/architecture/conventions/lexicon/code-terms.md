---
summary: "Approved identifier vocabulary: names for callable roles, operations, lifecycle stages, and Boolean predicates, in uniform per-class tables."
kind: reference
read_when: "Read before naming or renaming a type, function, method, property, or Boolean in code."
---

# Code terms

## UIX-owned role terms

These nouns name callable roles and consumer-held capabilities. Each has one grammatical role and one approved meaning.

| Term | Part of speech | Approved meaning / alternatives | Approved example | Nonconforming example |
| --- | --- | --- | --- | --- |
| `Appender` | noun | Consumer-held capability that appends values to an ordered pending collection. Use `Updater` when only the latest value remains current. | `AgentContextAppender` | `AgentContextUpdater` for an ordered pending list |
| `Assembler` | noun | Component that assembles one artifact from multiple registered or materialized parts. Use `Factory` for instance creation and `Projector` for derivation state. | `AgentContextAssembler` | `AgentContextBuilder` |
| `Callback` | noun | Callable provided for a continuation or customization point when no more specific role applies. Prefer the specific role when one exists. | `CompletionCallback` | `RequestCallback` for a request handler |
| `Coordinator` | noun | Substrate-owned, stateful component that sequences a multi-step lifecycle across independently owned participants and performs its side effects. Use `Installer` for setup-time runtime attachment, `Driver` for ownership of a runtime boundary, and `Assembler` for combining parts into one artifact. | `TurnStateCoordinator`, `WorkspaceReloadCoordinator` | `TurnStateCoordinator` for a callable whose only role is installing Pi hooks. Use `TurnStateInstaller` |
| `Factory` | noun | Component or callable that creates domain instances from known inputs and transfers responsibility for them to an owner. Use `Assembler` to combine defined parts into one artifact. | `DocumentStoreFactory` | `AgentContextFactory` for combining registered contributions. Use `AgentContextAssembler` |
| `Handle` | noun | Object that gives its holder a scoped capability. Use `Handler` for a callable that processes an occurrence. | `SettingsHandle` | `ChannelTransportHandle` for a registrar callable |
| `Handler` | noun | Callable that a framework invokes to process one occurrence and possibly determine its result. Use `Listener` for passive observation. | `ChannelRequestHandler` | `StatusHandler` for a callable that only observes status changes |
| `Installer` | noun | Setup-time callable or component that attaches a whole feature or facet slice to a runtime. Use `Registrar` for a callable that adds one item. | `AgentInstaller` | `SingleAgentToolInstaller` for a callable that registers one tool. Use `AgentToolRegistrar` |
| `Listener` | noun | Callable that observes an occurrence without determining its result. Use `Handler` when the callable processes the occurrence or provides its result. | `StatusListener` | `RequestListener` for a callable that must produce the request result |
| `Presentation` | noun | Purpose-specific human-facing material that forms an explicit intermediate boundary between display-policy derivation and UI composition or display execution. A presentation can be a derived projection. Use `Projection` when the result remains consumer-neutral domain data, an ordinary UI component when no intermediate boundary exists, and `Renderer` for the mechanism that executes web display. | `ToolChatBlockPresentation` | `ToolChatRenderer`, `MessageChatBlockPresentation` for a component with no intermediate presentation value |
| `Projector` | noun | Stateful component whose private state exists only to incorporate source facts and derive a projection. Use a `deriveX` function for a one-shot transformation. | `TranscriptProjector` | `ModelCatalogProjector` that only maps one input array. Use `deriveModelCatalog()` |
| `Publisher` | noun | Capability or callable that its holder invokes to publish an event. | `FeatureEventPublisher` | `ChannelTransportPublish` |
| `Registrar` | noun | Callable that its holder invokes to add an item to a registry or contribution point. Do not use this term for the registered record or returned lifetime capability. | `ActionContributionRegistrar` | `RegisterActionContribution` |
| `Runner` | noun | Callable that executes an action. | `ActionRunner` | `ActionRun` |
| `Runtime` | noun | Discrete, long-lived engine of a particular purpose. `createWorkspaceRuntime()` returns the `WorkspaceRuntime` for one open workspace. Its subsystems are the same shape scoped to one domain: the feature runtime, surface runtime, and agent runtime. A thing of the engine is `live`, the engine's, or the domain word. Use `at execution time` for when code runs. | `createWorkspaceRuntime()`, "the agent runtime" | "`runtime artifacts` for artifacts the runtime assembles (use `assembled artifacts`)" |
| `Updater` | noun | Consumer-held capability that replaces the current value or registered contribution after it becomes live. Use `Appender` for an ordered pending collection. | `ActionContributionUpdater` | `ActionContributionHandle` when update is the capability's defining operation |

## UIX-owned lifecycle terms

These adjectives and nouns name the stages a contribution passes through from authoring to liveness.

| Term | Part of speech | Approved meaning / alternatives | Approved example | Nonconforming example |
| --- | --- | --- | --- | --- |
| `Contribution` | noun | Declarative value provided by an author to a contribution point. Use `Installer` for code that directly attaches a whole slice to a runtime. | `ActionContribution` | `AgentInstaller` named as a contribution |
| `Normalized` | adjective | Converted into one canonical representation without binding live ownership, environment-dependent references, or derived identities. Use `Resolved` after those values become concrete. | `NormalizedResourceRoute` | `NormalizedActionContribution` after owner-derived ids are assigned |
| `Registered` | adjective | A separate live record created by registry acceptance with registry-owned state beyond the resolved input. When acceptance stores the resolved value unchanged, keep its `Resolved` type and let membership express liveness. | `RegisteredAction`, `RegisteredAgentContextAppendContribution` | `RegisteredAgentContextMaterializedContribution` with no fields beyond its resolved input |
| `Resolved` | adjective | Owner-derived identifiers, paths, references, or environment-dependent values are concrete and the value is ready to register. | `ResolvedActionContribution` | `ActionRegistration` for a registry-ready value |

## UIX-owned operation terms

These verbs and prepositions hold approved operation meanings. Use each term only for its approved meaning. Do not introduce a synonym when an approved operation already fits.

Use _normalize_ when the result depends only on the input value. Use _resolve_ when ownership, paths, references, or environment can change the result. For example, `normalizeShortcut()` is context-free. `resolveAgentToolContribution()` derives a concrete Pi tool name for each owning feature.

In UIX, `resolve` means contextual or reference resolution, not conflict arbitration. A resolver makes identities and references concrete. The receiving registry rejects collisions instead of selecting a winner.

| Term | Part of speech | Approved meaning / alternatives | Approved example | Nonconforming example |
| --- | --- | --- | --- | --- |
| `as` | preposition | Refine a value without throwing and return `undefined` when it does not conform. Use `parse` when invalid input throws. | `asRecord(value)` | `parseRecord(value)` for a non-throwing refinement |
| `assemble` | verb | Combine multiple defined or materialized parts into one artifact. Use `derive` for a projection, `create` for an owned instance, and `build` for compilation. | `assembleAgentContextMessage()` | `buildAgentContextMessage()` |
| `bind` | verb | Establish a removable or replaceable relationship between independently existing participants. Enroll the relationship in an explicit lifetime. | `bindActionKeyboardDispatcher()` | `createActionKeyboardDispatcher()` when the operation only establishes a relationship |
| `build` | verb | Compile or bundle source into an executable artifact. Use `create` for an owned instance and `assemble` for defined parts. | `surfacePipeline.buildAll()` | `buildFeatureContext()` |
| `commit` | verb | Accept validated candidate state into an authority at an explicit boundary. | `commitCurrentTurnState()` | `saveCurrentTurnState()` |
| `create` | verb | Construct a domain instance or independently identified artifact whose identity, evolving state, or ownership matters. | `createAgentDriver()` | `createSelectedBranchProjection()` for a rebuildable view |
| `decode` | verb | Apply the reverse half of a reversible representation transform. Use `parse` when the transform is validation without a paired encoding. | `decodeResourceUrl()` | `parseResourceUrl()` when paired with `encodeResourceUrl()` |
| `define` | verb | Preserve identity or type agreement around public-API plain data without creating a live instance. | `defineSurface()` | `createSurface()` for a plain surface definition |
| `derive` | verb | Compute a new immutable, rebuildable value through filtering, joining, folding, reduction, or domain policy. Use a more specific approved transformation when its boundary applies. Otherwise use `derive` for pure policy computation instead of coining a verb from the result noun or return type. | `deriveSelectedBranchProjection()`, `deriveToolChatBlockPresentation()` | `createSelectedBranchProjection()`, `presentToolChatBlock()` |
| `encode` | verb | Apply one half of a reversible representation transform. Use `to` for an ordinary representation without a paired decoder. | `encodeResourceUrl()` | `toResourceUrl()` when a paired decoder defines the representation |
| `enumerate` | verb | Eagerly derive every member of a finite possibility set. Use `list` to retrieve existing items. | `enumerateUniqueModifierSequences()` | `listUniqueModifierSequences()` when the operation generates possibilities |
| `extract` | verb | Pull an existing part from a larger value without applying domain reduction policy. Use `derive` when policy computes a new view. | `extractTranscriptText()` | `deriveTranscriptText()` for direct extraction |
| `for` | preposition | Mint a capability with an owner or address bound into it. Use `get` for an ordinary current-value lookup. | `settingsRegistry.forScope(scopeId)` | `settingsRegistry.getScope(scopeId)` when the result is a newly scoped capability |
| `get` | verb | Perform a cheap current-value or property lookup without I/O or new authority. Use `read` for I/O and `for` for capability minting. | `driver.getStatus()` | `getSessionSummary()` when the operation reads a file |
| `hydrate` | verb | Fill defaults into persisted values and validate the result without storing values or registering live behavior. | `hydrateSettings()` | `loadSettings()` for a pure schema pass |
| `install` | verb | Attach a whole feature or facet slice to a runtime by registering its concrete behavior. Use `register` for one item and `bind` for one removable relationship. | `installProcessHandlers()` | `registerProcessHandlers()` for whole-slice setup |
| `list` | verb | Retrieve existing items. Use `enumerate` when the operation generates every member of a possibility set. | `listModels()` | `enumerateModels()` for models that already exist |
| `load` | verb | Turn persisted or external content into its live registered form. A load can contain a read and can have side effects. | `loadFeatures()` | `readFeatures()` when the operation activates them |
| `materialize` | verb | Turn one abstract, lazy, or buffered contribution into concrete content. Use `assemble` to combine many concrete parts. | `materializeContribution()` | `assembleContribution()` for one contribution |
| `normalize` | verb | Convert a value into one canonical representation without binding owner-derived identities or environment-dependent references. Use `resolve` when those values become concrete. | `normalizeShortcut()` | `normalizeActionContribution()` when the operation derives owner-scoped ids. Use `resolveActionContribution()` |
| `open` | verb | Start a long-lived stateful object whose lifetime an owner must manage. | `openWorkspace()` | `getWorkspace()` when the operation starts its runtime lifetime |
| `parse` | verb | Validate unknown or external input into a domain value and throw when it is invalid. Use `as` or `tryParse` for a non-throwing result. | `parseWorkspaceManifest()` | `asWorkspaceManifest()` when invalid input throws |
| `project` | verb | Incorporate one source fact into a projector's private derivation state. Use `derive` to return the final immutable result. | `projector.projectEntry(entry)` | `const result = projector.project()`. Use `deriveSnapshot()` |
| `read` | verb | Read from disk, a store, a stream, or another I/O-shaped source without creating live registered state. Use `get` for a cheap lookup and `load` for activation. | `readSessionSummary()` | `getSessionSummary()` when the operation reads a file |
| `register` | verb | Put one item into a registry or contribution point. Use `install` for setup that attaches a whole slice to a runtime. | `actionRegistry.register()` | `installAction()` for one registry item |
| `require` | verb | Retrieve an expected value and throw when it is absent. Use `get` when absence is an ordinary result. | `requireManifestFeatureEntry()` | `getManifestFeatureEntry()` when absence throws |
| `resolve` | verb | Make owner-derived identifiers, paths, references, or environment-dependent values concrete. Include an axis when it can produce materially different results. | `resolveActionContribution()`, `resolveAgentToolContribution()`, `resolveShortcutForPlatform()` | `normalizeActionContribution()` after owner-scoped ids are derived |
| `restore` | verb | Replace live state from previously committed state or a referenced snapshot. Use `set` for an ordinary value replacement. | `cell.restore(state)` | `cell.set(state)` for branch restoration |
| `set` | verb | Replace an ordinary current value through its owning object. Use `commit` at an authority boundary and `restore` for previously committed state. | `settings.set(key, value)` | `settings.commit(key, value)` for an ordinary replacement |
| `to` | preposition | Produce a deterministic, side-effect-free representation of the same underlying value. The result has no independent identity. | `toChannelCanonicalId()` | `createChannelCanonicalId()` for a recomputable value |
| `tryParse` | verb | Attempt to parse input without throwing and return `undefined` when it is invalid. Use `parse` when invalid input throws. | `tryParseShortcut(value)` | `parseShortcut(value)` for a non-throwing attempt |

## UIX-owned predicate terms

These terms phrase Boolean claims. Each states a truth claim about state, capability, or policy.

| Term | Part of speech | Approved meaning / alternatives | Approved example | Nonconforming example |
| --- | --- | --- | --- | --- |
| `can` | modal verb | Context-dependent ability at the current time. Use `supports` for an intrinsic capability. | `canSwitchSession` | `supportsSessionSwitching` when current activity prevents switching |
| `did` | auxiliary verb | Outcome of an attempted operation. Use only for captured attempt results. | `didCommitState` | `didSupportManualInput` for an intrinsic capability |
| `has` | verb | Possession, existence, or completed progress. Use `is` for state or classification. | `hasSelection` | `isSelection` for possession of a selection |
| `is` | verb | Current state, classification, or validation. Use `has` for possession or existence. | `isAgentRunning` | `hasAgentRunning` for current running state |
| `needs` | verb | Unmet requirement that requires action. Use `should` for a policy or heuristic choice. | `needsReload` | `shouldReload` when correctness requires reload |
| `should` | modal verb | Policy or heuristic decision. Use `needs` for an unmet requirement. | `shouldRetry` | `needsRetry` when retry is only a policy choice |
| `supports` | verb | Intrinsic capability independent of current live state. Use `can` for current ability. | `supportsManualInput` | `canUseManualInput` when naming an implementation capability |
| `was` | verb | Captured prior state. Use only when the value intentionally records an earlier observation. | `wasAgentRunning` | `isAgentRunning` for a captured prior value |
