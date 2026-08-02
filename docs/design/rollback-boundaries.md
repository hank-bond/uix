---
summary: "Exploring one query/mutation/effect vocabulary across UIX's rollback stack so managed state can checkpoint and restore coherently while external consequences remain explicitly outside that guarantee."
kind: explanation
status: exploring
---

# Rollback boundaries

## Current synthesis

UIX needs one vocabulary for operations that cross a durable state or external-system boundary:

- A _query_ observes state without durably changing its authority. It may be reactive.
- A _mutation_ intends to atomically change a declared state authority. Mutation describes the operation's semantics, not proof that UIX implemented history for it.
- An _effect_ reaches beyond the rollback stack or otherwise has consequences UIX cannot coordinate and restore. An external database write is therefore an effect from UIX's viewpoint even if that database calls it a mutation.

The _rollback stack_ is the coordinated set of UIX-managed authorities: Pi session and turn state, managed documents, managed workspace files, and future managed application data. An authority actually participates when its implementation captures stable state and records the corresponding ref through the central checkpoint/turn-state lifecycle. This is an implementation fact, not a contributed permission or menu of claimed capabilities.

Rollback guarantees stop at that boundary. A workflow may perform an effect and then commit its result through a managed mutation; UIX can restore the mutation but cannot reverse the preceding effect. Compensation is not rollback. Tools, protocols, and diagnostics should eventually make this distinction clear to the Agent and human rather than relying on prose or inference.

Views react to committed truth. A successful managed mutation advances its authority and then invalidates the relevant resource or query projections; surfaces do not synchronize by messaging one another. Workspace checkpoints coordinate stable refs from participating authorities without claiming a distributed transaction, and promotion advances one coherent accepted state only after its candidate refs validate.

UIX owns this lifecycle and a good managed default, not an application data model. Feature state is private by default and crosses feature boundaries through public protocols. Features may use SQL, a typed query builder, or custom storage; custom and external state simply receives no rollback guarantee unless its owner integrates with the checkpoint lifecycle.

## Open axes

- Whether nondeterministic external reads are queries or effects.
- Where operation classification is declared across protocols, Agent tools, and managed data APIs.
- How committed invalidation and workspace checkpoint timing compose without forcing every mutation to create a durable checkpoint.
- How partial failure and non-rollbackable effects are presented during restore and promotion.

## Related threads

- [Cross-feature interoperability](./cross-feature-interoperability.md) owns the public protocol and shared-resource boundaries.
- [Pane and file versioning](./pane-and-file-versioning.md) owns the Git-backed document and workspace-file implementations.
- [Feature source admission](./feature-source-admission.md) owns compiler and schema rails for agent-authored feature code.

## Log

### 2026-07-29 — Convex comparison establishes the operation boundary

Convex's private component state, validated operations, query/mutation/action split, and commit-driven reactivity sharpened the useful UIX subset. UIX keeps owner-neutral protocols and heterogeneous state authorities rather than adopting Convex's component tree or backend runtime. The resulting distinction is query versus mutation versus effect, with actual rollback participation supplied by each managed authority's checkpoint integration and external consequences kept explicitly outside the guarantee.
