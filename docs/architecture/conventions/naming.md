---
summary: "Naming guidance beyond the rule cards: symbol roles, state-shape nouns, catalog names, and the projection-naming axes."
kind: reference
read_when: "Read before introducing or renaming symbols, recurring vocabulary, projections, or predicates."
---

# Naming

The naming rules in [`rules/`](./rules/) state the invariants. This file explains the patterns and tests that apply them.

## Symbol naming

- Prefer the simplest word that keeps the meaning exact. Use a more specialized word only when the simpler word would lose an important distinction.
- A `DisposableBag` or `AsyncDisposableBag` that owns cleanup capabilities takes its name from the lifetime it tracks: `hostBag`, `workspaceBag`, `windowBag`, `sessionBag`.
- Helpers that register listeners are verb-shaped: `handle`, `onApp`, `onWindow`, `subscribe`. They always return `Disposable`.
- Name symbols for their stable domain role and operation, not their current caller, pipeline position, trigger, owner, or implementation strategy. A name should remain correct if the symbol moves, gains another caller, or changes implementation without changing its essential domain guarantees. Let the receiver provide context (`turnStateCoordinator.restoreCurrent(...)`). Do not repeat that context in every method.
- Function names describe the observable domain operation. Include distinctions that identify materially different operations or results. Put lifecycle ordering, current usage, race policy, preconditions, and nuanced skipped outcomes in behavioral comments. Do not encode those volatile details into a symbol merely because one caller currently depends on them.
- Apply the ambiguity test: if two materially different operations could share a name, it is underspecified. Add the distinguishing domain, result, or resolution axis. Use `enumerateUniqueModifierSequences`, not `permutations`. Use `resolveShortcutForPlatform`, not `resolveShortcut`.
- Domain vocabulary is noun-shaped. Operations pair those nouns with the established verbs in [`code-terms.md`](./lexicon/code-terms.md). A domain noun keeps one grammatical role across types, values, and function results.
- Parameters name each participant's domain role (`transport`, `contract`, `scope`, `owner`, `session`, `lifetime`, `bag`). Access restrictions live in scoped capability types and handles.
- A domain catalog is `XCatalog`. One public item is `XCatalogEntry`. Reserve these names for the catalog concept in [`concepts.md`](../concepts.md). Do not use them for arbitrary lists or snapshots. Avoid `Descriptor` when the value is a catalog entry.
- State-shape nouns hold these meanings:
  - **State** is live, owner-held current authority that can change during its lifecycle. A state object may mutate in place or replace its current generation, and consumers observe it only through the owner's capabilities. `AgentInstanceSupervisionState` is the supervisor-owned lifecycle state for one live agent instance.
  - A **snapshot** is a detached, immutable point-in-time value or independently identified artifact. It never updates after the owner returns it and exposes no mutable alias into the source state. `toSnapshot()` converts one live value to its snapshot representation. `createDocumentSnapshot()` creates a store-owned artifact. `getCatalogSnapshot()` retrieves an existing current snapshot. `getGuardSnapshot()` captures active guard metadata without exposing guard authority.
  - A **projection** is a purpose-specific, read-only, lower-information view of authoritative state. It is rebuildable and never independently authoritative. Point-in-time and derivation are independent properties, so an owner may return a projection as a snapshot. A physically persisted projection has cache semantics. Use `deriveXProjection()` for a one-shot derivation.
  - A **baseline** is the reference value used for comparison by a later operation. It remains derived unless its owning domain commits it.
- React components are the exception: keep PascalCase noun names such as `Conversation` or `ChoiceButton`.
- Add any `Disposable` implementation directly to a bag without another wrapper.
- Use `Store` for durable source-of-truth APIs/implementations. A store may expose a change feed when the change semantics are generic at that layer. Otherwise domain-specific buffers/features publish higher-level invalidation events.
- Use `Buffer` for live, feature-specific working projections over a store. Buffers may cache regenerable state, normalize writes, and reconcile feature/editor semantics, but durable authority stays in the backing store.
- Use `Registry` for central in-memory maps of contributed things plus their routing (`ChannelRegistry`, `SettingsRegistry`). Registries do not persist.

## Observable capabilities

The `Observable` suffix names a read-only observation capability, not every object that supports subscriptions.

An observable provides synchronous `getSnapshot()` access and a `subscribe(listener)` method that returns an unsubscribe function. The snapshot remains immutable, and repeated reads return the same value until a change occurs. The owner replaces the snapshot before notifying listeners. Listeners receive no payload and read the replacement through `getSnapshot()`. An event stream without a current snapshot does not use this role.

Name the capability for its domain: `AttachmentWebRootsObservable` provides `AttachmentWebRootsSnapshot` values. An owner such as `WorkspaceSessionState` also provides domain operations and may implement the same observation protocol without taking the `Observable` suffix. Its name describes its broader responsibility.

A separate observable object is not required. An owner may provide a narrower interface backed by the same object, provided that interface offers only snapshot access and subscription. Introduce that interface when a consumer boundary needs read-only observation, not for every state owner. Neither the suffix nor the protocol requires a wrapper or a shared implementation.

## Qualification by scope

Name the scopes that distinguish real concepts, and omit a scope when the containing name already makes it clear.

| Axis | Question | Naming guidance |
| --- | --- | --- |
| **Ownership namespace** | Who owns these local names: `canvas`, another feature, or `uix`? | Include the namespace in live identities, but not in authored contracts. |
| **Declaration scope** | Is this a reusable definition rather than a live instance? | Use an unqualified name such as `WebRouteContract`. |
| **Instantiation scope** | Is this created once per Workspace or once per viewpoint? | Use `Workspace` or `Viewpoint` when both forms could exist at that boundary. |
| **Target scope** | Which attachment-target generation can this reach? | Name the binding `AttachmentWebBinding`. Do not repeat that scope on every client using it. |
| **Lifetime form** | Is this normalized, resolved, prepared, or registered? | Use the established lifecycle qualifier when those forms coexist. |
| **Containing scope** | Does the owner already establish the scope? | Use `AgentFeatureContributions.webRoutes`, not `viewpointWebRoutes`. |

A qualifier earns its place by separating two possible names at the same boundary. A generic route contract stays `WebRouteContract` because the same declaration can be installed for a Workspace or viewpoint. The Workspace contribution field is `viewpointWebRouteContracts` because it distinguishes those contracts from present or future Workspace route handlers. Inside `AgentFeatureContributions`, the field is `webRoutes` because the containing type already provides the viewpoint scope.

A role should not repeat a property required by that role. Every client already knows how to reach its API, so use `WebRouteClient`, not `BoundWebRouteClient`. Name the separate capability that chooses the live target, such as `AttachmentWebBinding`.

## Host-level names

Host directories communicate ownership, while names communicate purpose and scope. The [`naming.host-role`](./rules/naming.host-role.md) rule applies this distinction across concrete hosts.

- **Match equivalent responsibilities:** Use matching names across hosts when the concepts or processes have the same purpose and scope.
- **Qualify platform-specific concepts:** Use platform qualifiers only when they describe a genuine platform dependency, not merely the implementation's location.
- **Preserve meaningful differences:** Do not force matching names, files, or abstractions when host responsibilities differ.

Ask whether a qualifier explains the concept or only repeats its directory. `AttachmentWebBindingSnapshot` identifies equivalent routing state without a host prefix. Electron's IPC events and the server's WebSocket messages still use their specific transport vocabulary. Matching names do not require shared implementations or symmetric source trees.

## Owned-name prefixes

Project-owned names do not use the project name as a prefix. The repository, package, or owning feature is already the namespace. Each prefix is one more mention a project rename must chase down.

The project name is reserved for names that live in a namespace shared with contributed or external components. There, the prefix is the discrete namespace separating system-owned names from theirs ([naming.project-prefix](./rules/naming.project-prefix.md)).

Vale styles use plain names (`grammar`, `lexicon`, `comments`). Internal symbols use plain names (`substrateChannels`). Feature-authored markers in content use the feature's name (`data-canvas-prompt`, `canvas:writeback`).

Substrate IPC channel names, the resource origin, the surface-root marker, the agent-context envelope, and the workspace manifest keep the reserved prefix. They must be recognizable inside streams or catalogs the system does not fully own.

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
| Selected branch | `asOfLeaf` | Displayable messages, model changes, registered turn-state cells, tool results joined by tool-call id | Ordered transcript, latest model, latest value per cell | `SelectedBranchProjection` with `transcript`, `model`, and `turnStateAsOfLeaf.latestValuePerCell` |
| Action bindings | `forPlatform` | Active actions joined to confirmed bindings by action id. Inactive bindings split out as unresolved | Conflict claimants collected per resolved shortcut | `ActionBindingProjection` |
| Provider authentication | current `ModelRuntime` | Interactive provider-owned login methods joined with non-secret connection status | Connected providers ranked before remaining provider names | `ProviderAuthCatalog` |
| Canvas anchors | `asOfDocumentVersion` or current working content | Addressable text joined to retained anchor identity | Anchor continuity reconciled per document and line | `AnchoredDocument` working projection |
