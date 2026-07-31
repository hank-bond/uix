---
summary: "UIX code expresses stable domain contracts through canonical identifier grammar and comments limited to non-obvious rationale and durable constraints."
read_when: "Read before introducing or renaming symbols, recurring vocabulary, projections, predicates, or explanatory comments."
status: active
---

# Naming and comments

## Naming

- A `DisposableBag` that owns registrations is named after the lifetime it tracks: `appBag`, `windowBag`, `sessionBag`.
- Helpers that register listeners are verb-shaped: `handle`, `onApp`, `onWindow`, `subscribe`. They always return `Disposable`.
- Name symbols for their stable domain role and operation, not their current caller, pipeline position, trigger, owner, or implementation strategy. A name should remain correct if the symbol moves, gains another caller, or changes implementation without changing its essential domain contract. Let the receiver provide context (`turnStateLifecycle.restoreCurrent(...)`); do not repeat that context in every method.
- Function names describe the observable domain operation. Include distinctions that identify materially different operations or results; put lifecycle ordering, current usage, race policy, preconditions, and nuanced skipped outcomes in contract comments. Do not encode those volatile details into a symbol merely because one caller currently depends on them.
- Apply the ambiguity test: if two materially different operations could reasonably share the name, it is underspecified. Add the distinguishing domain, result, or resolution axis — `enumerateUniqueModifierSequences`, not `permutations`; `resolveShortcutForPlatform`, not `resolveShortcut`.
- Domain vocabulary is noun-shaped; operations pair those nouns with the established verbs below. A domain noun keeps one grammatical role across types, values, and function results.
- Parameters name each participant's domain role (`transport`, `contract`, `scope`, `owner`, `session`, `lifetime`, `bag`). Access restrictions live in scoped capability types and handles.
- A domain catalog is `XCatalog`; one public item is `XCatalogEntry`. Reserve these names for the catalog concept defined in [concepts](../concepts.md), not arbitrary lists or snapshots; avoid the generic `Descriptor` suffix when the value's actual role is a catalog entry.
- Private helper functions should generally be operation-shaped so the call site says what operation is happening. Prefer:
  - `parseX` for unknown/external input that validates into `X`; invalid input throws;
  - `asX` / `tryParseX` for non-throwing refinement/parsing helpers that return `X | undefined`;
  - `extractX` for pulling data out of a larger value;
  - `enumerateX` for eagerly deriving every member of a finite possibility set; `listX` retrieves existing items instead of generating possibilities;
  - `getX` for cheap property lookup with no I/O;
  - `requireX` for retrieving an expected value and throwing when absent;
  - `toX` for a deterministic, side-effect-free representation of the same underlying thing; the result has value semantics, no independent identity, and is safe to discard and recompute;
  - `deriveX` for a new immutable value computed through filtering, joining, folding, reduction, or domain policy; the result has value semantics and remains rebuildable from authoritative inputs;
  - `encodeX` / `decodeX` for reversible representation transforms;
  - boolean-returning helpers follow the predicate vocabulary below;
  - `readX` only for real reads from disk, stores, streams, or similarly I/O-shaped sources.
- Module-level and lifecycle verbs. Each verb earns its slot by meaning something the others don't; don't introduce a synonym when an existing verb fits:
  - `createX` for constructing a domain instance or independently identified artifact from known inputs. The result has instance semantics: its identity or evolving state matters, it is used over time, and an owner receives responsibility for it.
  - `buildX` is **reserved for compilation/bundling pipelines** (the surface module pipeline's esbuild passes). Plain object assembly is `createX`, not `buildX`.
  - `readX` (disk → parsed data, no runtime side effects) vs `loadX` (persisted or external content → its **live, registered runtime form**; side effects expected — `loadFeatures`, `loadScope`). A load typically contains a read.
  - `hydrateX` for the pure schema pass between the two: fill defaults into persisted values and validate, no storage or registration (`hydrateSettings`).
  - `openX` for starting a long-lived stateful thing whose lifetime someone must own (`openWorkspace`, `openSession`).
  - `registerX` for putting an item into a registry; registries' own mutation methods use the same verb (`register`, `registerScope`).
  - `resolveX` for mapping a reference to the concrete thing it denotes (`resolveWorkspace`); include a result-determining axis when the unqualified name permits materially different resolutions (`resolveShortcutForPlatform`).
  - `bindX` for establishing a removable or replaceable relationship among independently existing participants (`bindSettingsHandle`, `bindActionKeyboardDispatcher`). The relationship is enrolled in an explicit lifetime while the participants retain their own lifetimes; construction and binding are separate operations when the instance and relationship have independent lifetimes.
  - `commitX` for accepting validated candidate state into an authority at an explicit boundary (`registration.commit()`, `commitCurrentTurnState`).
  - `restoreX` for replacing live state from previously committed state or referenced snapshots.
  - `defineX` for public-API identity/type-checking helpers around plain data (`defineSettings`, `defineSurface`).
  - `forX(id)` for minting a capability handle scoped to one owner (`forScope`); see the handle convention below.
- State-shape nouns carry these meanings:
  - A **snapshot** is an immutable point-in-time value or independently identified artifact. `toSnapshot()` converts one live value to its snapshot representation; `createDocumentSnapshot()` creates a store-owned artifact; `getCatalogSnapshot()` retrieves an existing current snapshot.
  - A **projection** is a purpose-specific, read-only, lower-information view of authoritative state. It is rebuildable and never independently authoritative; a physically persisted projection has cache semantics. Use `deriveXProjection()` for a one-shot derivation.
  - A **baseline** is the reference value used for comparison by a later operation; it remains derived unless its owning domain commits it.
- React components are the exception: keep PascalCase noun names such as `Conversation` or `ChoiceButton`.
- Anything implementing `Disposable` is fine to add to a bag — no ceremony needed.
- Use `Store` for durable source-of-truth APIs/implementations. A store may expose a change feed when the change semantics are generic at that layer; otherwise domain-specific buffers/features publish higher-level invalidation events.
- Use `Buffer` for live, feature-specific working projections over a store. Buffers may cache regenerable state, normalize writes, and reconcile feature/editor semantics, but durable authority stays in the backing store.
- Use `Registry` for central in-memory maps of contributed things plus their routing (`ChannelRegistry`, `SettingsRegistry`); registries don't persist.

### Boolean predicates

**Rule.** Boolean variables, fields, and functions phrase a truth claim with this small default vocabulary:

| Prefix | Meaning | Example |
| --- | --- | --- |
| `is` | Current state, classification, or validation | `isAgentRunning`, `isSessionFile` |
| `has` | Possession, existence, or completed progress | `hasSelection`, `hasReadFirstRecord` |
| `can` | Context-dependent ability right now | `canSwitchSession` |
| `supports` | Intrinsic capability independent of current live state | `supportsManualInput` |
| `should` | Policy or heuristic decision | `shouldRetry` |
| `needs` | An unmet requirement requiring action | `needsReload` |

Keep `supports` distinct from `can`: an implementation may expose `supportsSessionSwitching` while the workspace cannot currently switch because the agent is running. Keep `should` distinct from `needs`: the former records a policy choice, while the latter states that correctness or completion requires work.

`was` and `did` are narrow grammatical exceptions for captured prior state and the outcome of an attempted operation (`wasAgentRunning`, `didCommitState`); they are not additional default choices. Do not use `will` as a general prediction flag—once control flow has committed to an operation, prefer making that structure explicit. If several booleans represent mutually exclusive states, replace them with one status/discriminated union rather than finding more predicate names.

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
