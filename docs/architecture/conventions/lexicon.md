---
summary: "The controlled lexicon assigns every UIX word one meaning and grammatical role in uniform per-class tables, with the reserve and retire governance."
kind: reference
read_when: "Read before introducing a recurring word, reviewing wording in comments or docs, or extending the controlled lexicon."
---

# Lexicon

UIX prose and comments are mostly LLM-generated, so one concept drifts across several words and one word drifts across several meanings. This file assigns each controlled word one role and records the decisions in uniform tables.

Scope: active code, comments, and documentation. Historical records (decisions, design threads, archives) keep their wording. Universal concrete nouns (`file`, `path`, `location`, `key`, `value`) never enter the list because their meaning is obvious in context.

Every entry follows the STE shape: one word, one part of speech, one meaning, one conforming example, one nonconforming example. Agents extend the tables in place with the same shape. A new word starts with one conforming and one nonconforming example.

## Governance

Each controlled word has one meaning and one part of speech. A defined noun cannot be used as a verb, and a defined verb cannot be used as a noun. All other uses are nonconforming.

Decide a word's fate by asking four questions in order:

1. **Overload.** Does the word have more than one common English sense? If not, keep it.
2. **Collision.** Do the other senses plausibly occur in UIX prose? If not, register-confined senses (legal, nautical) never collide, so keep it.
3. **Best carrier.** Is this word the best word for our meaning? If yes, reserve it: the domain meaning owns the word and every other sense is nonconforming.
4. **Cleaner alternative.** Does a single-meaning word cover our meaning? If yes, retire it: ban the word in all senses and use the alternative.

Candidates appear two ways. **Overload:** one word with several meanings, found by reading (as in `save`). **Drift:** one concept with several words, found by profiling the corpus (as in `combine`, `join`, `merge`, `collect` for `assemble`).

Operating rules:

- **No partial bans.** A word is reserved (our sense owns it) or retired (all senses are out). Banning one sense of a living word loses to the LLM distribution, which keeps producing the word in its other senses.
- **Overloaded words resolve to one role.** A word with both noun and verb senses in everyday English gets one defined role. The other role is actively nonconforming. Do not leave the second role ungoverned.
- **Decisions migrate their corpus.** When a word is reserved or retired, migrate existing nonconforming uses in the same change: identifiers, headers, comments, and active docs. Historical records keep their wording. Retiring a word that names an API operation includes a code rename.
- **The single-meaning word beats the plain word.** This overrides the simplest-word-that-works rule in the style guide when the plain word is overloaded (`retain` over `keep`).
- **Retirement requires a single-meaning alternative for every sense.** `save` retires because `persist`, `defer`, and `protect` each cover one sense cleanly.
- **Vale enforces only the negative space:** retired words and always-wrong patterns. Semantic alignment is a review and LLM pass against this list.

## UIX-owned role terms

These nouns name callable roles and consumer-held capabilities. Each has one grammatical role and one approved meaning.

| Term | Part of speech | Approved meaning / alternatives | Approved example | Nonconforming example |
| --- | --- | --- | --- | --- |
| `Appender` | noun | Consumer-held capability that appends values to an ordered pending collection. Use `Updater` when only the latest value remains current. | `AgentContextAppender` | `AgentContextUpdater` for an ordered pending list |
| `Assembler` | noun | Component that assembles one runtime artifact from multiple registered or materialized parts. Use `Factory` for instance creation and `Projector` for derivation state. | `AgentContextAssembler` | `AgentContextBuilder` |
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
| `assemble` | verb | Combine multiple defined or materialized parts into one runtime artifact. Use `derive` for a projection, `create` for an owned instance, and `build` for compilation. | `assembleAgentContextMessage()` | `buildAgentContextMessage()` |
| `bind` | verb | Establish a removable or replaceable relationship between independently existing participants. Enroll the relationship in an explicit lifetime. | `bindActionKeyboardDispatcher()` | `createActionKeyboardDispatcher()` when the operation only establishes a relationship |
| `build` | verb | Compile or bundle source into an executable artifact. Use `create` for an owned instance and `assemble` for defined runtime parts. | `surfacePipeline.buildAll()` | `buildFeatureContext()` |
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
| `load` | verb | Turn persisted or external content into its live registered runtime form. A load can contain a read and can have runtime side effects. | `loadFeatures()` | `readFeatures()` when the operation activates them |
| `materialize` | verb | Turn one abstract, lazy, or buffered contribution into concrete content. Use `assemble` to combine many concrete parts. | `materializeContribution()` | `assembleContribution()` for one contribution |
| `normalize` | verb | Convert a value into one canonical representation without binding owner-derived identities or environment-dependent references. Use `resolve` when those values become concrete. | `normalizeShortcut()` | `normalizeActionContribution()` when the operation derives owner-scoped ids. Use `resolveActionContribution()` |
| `open` | verb | Start a long-lived stateful object whose lifetime an owner must manage. | `openWorkspace()` | `getWorkspace()` when the operation starts its runtime lifetime |
| `parse` | verb | Validate unknown or external input into a domain value and throw when it is invalid. Use `as` or `tryParse` for a non-throwing result. | `parseWorkspaceManifest()` | `asWorkspaceManifest()` when invalid input throws |
| `project` | verb | Incorporate one source fact into a projector's private derivation state. Use `derive` to return the final immutable result. | `projector.projectEntry(entry)` | `const result = projector.project()`. Use `deriveSnapshot()` |
| `read` | verb | Read from disk, a store, a stream, or another I/O-shaped source without creating a live registered runtime. Use `get` for a cheap lookup and `load` for activation. | `readSessionSummary()` | `getSessionSummary()` when the operation reads a file |
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

## Imported terms

These terms retain the meaning and grammar of the named source API when UIX directly represents the external concept. The part-of-speech cell appends the provenance.

| Term | Part of speech | Approved meaning / alternatives | Approved example | Nonconforming example |
| --- | --- | --- | --- | --- |
| `Disposable` | noun (ECMAScript) | Object with deterministic cleanup through `Symbol.dispose`. Use a more specific capability role when cleanup is not its defining operation. | `DisposableBag` | `ActionContributionDisposable` for an update-and-dispose capability |
| `handle` | verb (Electron) | Register an Electron IPC invocation handler. Use UIX-owned role nouns outside a direct representation of that API. | `ipc.handle(...)` | `ChannelRequestContribution.handle` for a stored UIX callback |
| `Renderer` | noun (browser/Electron) | The web display execution environment or a mechanism that directly manages it. Reserve UIX-owned adoption for substrate display execution. Use `Presentation` for human-facing material prepared for that boundary. | `renderer process` | `ToolChatRenderer` |

## Reserved terms

Domain nouns own their word. Verb uses of the same spelling are nonconforming.

| Term | Part of speech | Approved meaning / alternatives | Approved example | Nonconforming example |
| --- | --- | --- | --- | --- |
| `turn` | noun | One user–agent prompt–response exchange. | "agent turn", "turn state" | "Turns read and write tool paths into stable locations" (verb use) |
| `store` | noun | Durable source-of-truth API or implementation. | "the document store" | "Stores each document's current content" (use `persists`) |
| `buffer` | noun | Live, feature-specific working projection over a store. | "canvas document buffer" | "Buffers feature-provided context" (use `accumulates`) |
| `surface` | noun | Contributed UI composition. | "the workspace surface" | "the error surfaces when it fails" (use `appears`) |
| `contract` | noun | The explicit public definition of a feature–substrate boundary: the schema- and type-only surface a feature author declares and the substrate implements. A channel is the request/event form of a contract. | "the agent channel contract", "author contracts that features import" | "durability defines the contract" (use `guarantees`), "contract comments" (use `behavioral comments`) |
| `channel` | noun | A contract for typed requests, responses, and events exchanged over the substrate transport. | "feature channel requests" | "channels resources into the runtime" (use `routes`) |
| `report` | noun | A collection of information prepared for agent or human consumption, such as an analysis artifact. | "reports, dashboards, and knowledge tools", "a report renderer" | "Myers reports only real changes" (use `returns`), "report diagnostics" (use `expose`) |

## Retired terms

The word is banned in all senses. Use the stated alternative.

| Term | Part of speech | Approved meaning / alternatives | Approved example | Nonconforming example |
| --- | --- | --- | --- | --- |
| `Registration` | noun | Retired because it named several lifecycle stages. Use `ResolvedXContribution` for registry-ready input, `RegisteredX` for live registry state, and a capability role for the returned value. | `ResolvedActionContribution`, `RegisteredAction` | `ActionRegistration` |
| `save` | verb | Retired. Use `persist` for durable storage, `defer` for a later time, `protect` for keeping safe. | "Persists each document's current content" | "Saves each document's current content", "save it for later" |
| `verify` | verb | Retired for structural checks. Use `validate`. | "validates the transport scheme and origin host" | "verifies the transport scheme and origin host" |
| `supply` | verb | Retired. Use `provide`. | "provides the resource address" | "supplies the resource address" |
| `carry` | verb | Retired. Name the actual relationship: `includes`, `holds`, or the specific relation. | "the factory return type holds the schema" | "the factory return type carries the schema" |

## Locked meanings

The word stays, with one meaning that cannot drift. A locked row states the prose-usage boundary for a term that also holds a UIX-owned row, which keeps the meaning and code examples.

| Term | Part of speech | Approved meaning / alternatives | Approved example | Nonconforming example |
| --- | --- | --- | --- | --- |
| `assemble` | verb | Prose boundary: do not use `combine`, `join`, `merge`, or `collect` for assembly. The code vocabulary lives in the [operation-terms section](#uix-owned-operation-terms). | "Assembles each feature's system-prompt section in workspace order" | "Collects each feature's system-prompt section and joins them for Pi" |
| `validate` | verb | Apply schema or structural checks. `check` remains for constraint tests. | "validates query with TypeBox" | "checks query with TypeBox" |
| `commit` | verb | Accept validated candidate state into an authority at an explicit boundary. The code vocabulary lives in the [operation-terms section](#uix-owned-operation-terms). | "Commits and restores each feature's private branch state" | "Saves and restores each feature's private branch state" |
| `persist` | verb | Write durable state. The mechanism verb. | "Pi persists the entry" | "Pi saves the entry" |
| `provide` | verb | Actively hand something to a consumer. | "provides the resource address" | "supplies the resource address" |
| `expose` | verb | Make reachable through a public contract. | "jiti's interop proxy exposes named exports" | "exposes the address to the renderer" (use `provides`) |
| `emit` | verb | Produce an event. Do not emit values or rows. | "main emits the event" | "emits the authoritative born-keyed row" (use `sends`) |
| `retain` | verb | Hold onto a value or membership across changes. Prefer over `keep` for this sense. | "retains the latest value" | "keeps the latest value" |
| `mirror` | verb | Reflect live external changes or events into an internal view or state, with side effects. The non-pure counterpart to `derive`. | "Mirrors live Pi session events as renderer transcript updates", "mirrors Pi-initiated model changes into status" | "Turns live Pi session events into renderer transcript updates" |
| `rekey` | verb | Replace a live row's temporary transport identity with its durable canonical identity at the persistence boundary. | "Rekeys temporary live transcript IDs to durable Pi entry IDs when Pi persists messages" | "Replaces temporary live transcript IDs with durable Pi entry IDs when messages are saved" |
