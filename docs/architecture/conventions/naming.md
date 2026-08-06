---
summary: "Naming guidance beyond the rule cards: symbol roles, state-shape nouns, catalog names, and the projection-naming axes."
kind: reference
read_when: "Read before introducing or renaming symbols, recurring vocabulary, projections, or predicates."
---

# Naming

The naming rules in [`rules/`](./rules/) state the invariants. This file explains the patterns and tests that apply them.

## Symbol naming

- A `DisposableBag` that owns cleanup capabilities takes its name from the lifetime it tracks: `appBag`, `windowBag`, `sessionBag`.
- Helpers that register listeners are verb-shaped: `handle`, `onApp`, `onWindow`, `subscribe`. They always return `Disposable`.
- Name symbols for their stable domain role and operation, not their current caller, pipeline position, trigger, owner, or implementation strategy. A name should remain correct if the symbol moves, gains another caller, or changes implementation without changing its essential domain guarantees. Let the receiver provide context (`turnStateCoordinator.restoreCurrent(...)`). Do not repeat that context in every method.
- Function names describe the observable domain operation. Include distinctions that identify materially different operations or results. Put lifecycle ordering, current usage, race policy, preconditions, and nuanced skipped outcomes in behavioral comments. Do not encode those volatile details into a symbol merely because one caller currently depends on them.
- Apply the ambiguity test: if two materially different operations could share a name, it is underspecified. Add the distinguishing domain, result, or resolution axis. Use `enumerateUniqueModifierSequences`, not `permutations`. Use `resolveShortcutForPlatform`, not `resolveShortcut`.
- Domain vocabulary is noun-shaped. Operations pair those nouns with the established verbs in [`code-terms.md`](./lexicon/code-terms.md). A domain noun keeps one grammatical role across types, values, and function results.
- Parameters name each participant's domain role (`transport`, `contract`, `scope`, `owner`, `session`, `lifetime`, `bag`). Access restrictions live in scoped capability types and handles.
- A domain catalog is `XCatalog`. One public item is `XCatalogEntry`. Reserve these names for the catalog concept in [`concepts.md`](../concepts.md). Do not use them for arbitrary lists or snapshots. Avoid `Descriptor` when the value is a catalog entry.
- State-shape nouns hold these meanings:
  - A **snapshot** is an immutable point-in-time value or independently identified artifact. `toSnapshot()` converts one live value to its snapshot representation. `createDocumentSnapshot()` creates a store-owned artifact. `getCatalogSnapshot()` retrieves an existing current snapshot.
  - A **projection** is a purpose-specific, read-only, lower-information view of authoritative state. It is rebuildable and never independently authoritative. A physically persisted projection has cache semantics. Use `deriveXProjection()` for a one-shot derivation.
  - A **baseline** is the reference value used for comparison by a later operation. It remains derived unless its owning domain commits it.
- React components are the exception: keep PascalCase noun names such as `Conversation` or `ChoiceButton`.
- Add any `Disposable` implementation directly to a bag without another wrapper.
- Use `Store` for durable source-of-truth APIs/implementations. A store may expose a change feed when the change semantics are generic at that layer. Otherwise domain-specific buffers/features publish higher-level invalidation events.
- Use `Buffer` for live, feature-specific working projections over a store. Buffers may cache regenerable state, normalize writes, and reconcile feature/editor semantics, but durable authority stays in the backing store.
- Use `Registry` for central in-memory maps of contributed things plus their routing (`ChannelRegistry`, `SettingsRegistry`). Registries do not persist.

## Projection naming

Describe a projection through the axes that can change its result. Not every projection uses every axis. Names, parameters, and result fields must let callers predict the view.

| Axis | Question | Naming pattern |
| --- | --- | --- |
| **Sources** | Which authoritative inputs are viewed? | Name the domain sources in the projection or its parameters. |
| **Viewpoint** | From which contextual coordinate are the sources interpreted? | `AsOfX` for a position in ordered history. `ForX` for an observer or environment. |
| **Selection** | Which source facts participate? | Use domain qualifiers such as `active`, `visible`, `offered`, or `unresolved`. |
| **Correlation** | How are facts from different sources or positions joined? | `ByX` names a lookup or join key (`bindingByActionId`, `resultByToolCallId`). |
| **Partition** | Which groups are reduced independently? | `PerX` names the partition (`latestValuePerCell`, `claimantsPerShortcut`). |
| **Reduction** | How does each partition become a result? | Name the policy before the partition: `latestValuePerCell`, `countPerStatus`, `averageLatencyPerWindow`. |
| **Result shape** | What consumer-facing view is produced? | Use the domain noun: `TranscriptSnapshot`, `ActionBindingProjection`, `ProviderAuthCatalog`. |

A **projector** is the stateful derivation component used when cross-entry correlation or one shared source traversal requires incremental state. Name its factory `createXProjector`. `projectX(...)` incorporates one source fact into private derivation state. A receiver-qualified `deriveX()` returns the immutable result. For example:

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
| Selected branch | `asOfLeaf` | Displayable messages, registered turn-state cells, tool results joined by tool-call id | Ordered transcript, latest value per cell | `SelectedBranchProjection` with `transcript` and `turnStateAsOfLeaf.latestValuePerCell` |
| Action bindings | `forPlatform` | Active actions joined to confirmed bindings by action id. Inactive bindings split out as unresolved | Conflict claimants collected per resolved shortcut | `ActionBindingProjection` |
| Provider authentication | current `ModelRuntime` | Interactive provider-owned login methods joined with non-secret connection status | Connected providers ranked before remaining provider names | `ProviderAuthCatalog` |
| Canvas anchors | `asOfDocumentVersion` or current working content | Addressable text joined to retained anchor identity | Anchor continuity reconciled per document and line | `AnchoredDocument` working projection |
