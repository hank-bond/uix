---
summary: "Feature turn state records each feature's small private snapshots on the Pi session branch and restores them before the feature resumes work."
kind: reference
status: draft
implementation: incomplete
---

# Feature turn state

## Contract

_Feature turn state_ gives each Agent feature instance small, private, durable state on the Pi session branch. A feature divides that state into named cells that can change independently. Each cell declares a TypeBox schema, an operation that returns its complete value, and an operation that restores that value.

UIX validates and persists cell snapshots, derives the selected branch's latest cell values, and restores each feature. UIX does not interpret the values.

Turn state is hidden from the model. A feature may use its committed history to derive separate model context, but the turn-state entries do not become conversation content.

## Dependencies

This specification depends on [`agent-viewpoints.md`](./agent-viewpoints.md) for selected-branch identity and for any UIX-owned operating state recorded beside feature cells. It also follows Pi's append-only session tree, Agent feature-instance lifetimes, TypeBox validation, contribution identity, and the exported turn-state APIs.

## Boundary

UIX assigns stable cell identities, appends branch entries, derives the selected branch's current values, and orders commits and restoration. It provides cell history and ignores restore work from old feature generations. Independent features can attempt restoration despite a peer's failure.

Each feature defines its cells, produces their complete values, restores its working state, and interprets any external snapshot references. It also owns any model context derived from that state.

Turn state does not persist or interpret Canvas documents, filesystem trees, database branches, or other large state. Their stores persist that state first. Turn-state cells contain only the small JSON values or stable references needed for restoration. UIX may record Agent-viewpoint fields such as cwd in the same private branch entry, but [`agent-viewpoints.md`](./agent-viewpoints.md) defines their behavior.

## Requirements

### Cells and identity

- An Agent feature instance **must** declare turn-state cells through its ordinary contribution lifetime.
- UIX **must** derive each cell's identity from its feature identity and feature-local name.
- Duplicate active cell identities **must** fail feature activation instead of resolving by declaration order.
- A cell **must** declare one TypeBox schema for both new snapshots and persisted values.
- A cell snapshot **must** be plain finite JSON. Functions, symbols, non-finite numbers, cyclic values, class instances, and executable codecs are not valid cell state.
- A cell's snapshot operation **must** return its complete current value, not a delta from an implicit in-memory baseline.
- A cell's restore operation **must** replace its working state from the provided complete value. `undefined` means restore feature-defined defaults.

### Persistence

- Turn state **must** be persisted as host-private entries in the Pi session tree. Those entries **must not** appear in the model or human transcript by default.
- Each entry **may** sparsely contain only cells whose complete values changed from the nearest upstream committed values.
- UIX **must** suppress a commit when no active cell or UIX-owned viewpoint field in the entry has changed.
- UIX **must** validate persisted values against their active schemas before restoration.
- UIX **must** validate cell snapshots before appending an entry. An invalid snapshot **must** reject the commit without writing branch state.
- Turn-state entries **must** preserve unknown or inactive feature data in the durable session tree even though the current branch view contains only active cells.
- A cell **may** record a stable reference without making turn state interpret the referenced data.

### Branch values and history

- UIX **must** derive turn state solely from the selected session branch.
- UIX **must** read entries from the session root to the selected leaf and retain the latest value for each active cell.
- Values from a sibling branch **must not** appear in the selected branch's turn state.
- A feature **must** receive history access only for its own cell names.
- History **must** preserve branch order and support bounded recent reads without exposing another feature's private cells.
- After branch selection changes, UIX **must** restore from the newly selected branch rather than from old in-memory state.

### Commit boundaries

Cells select capture boundaries within Agent runs and turns, using the reserved meanings in [`prose-terms.md`](../architecture/conventions/lexicon/prose-terms.md#reserved-terms):

| Boundary | Meaning |
| --- | --- |
| Pre-run | Before the user prompt enters session history. |
| Post-turn | After an Agent turn completes and its tool execution settles, before the next model invocation. |
| Post-run | After the overall Agent run completes and its outstanding execution settles. |

- A cell **may** select a set of pre-run, post-turn, and post-run capture boundaries.
- When a cell omits its schedule, UIX **must** use pre-run and post-run boundaries for that cell.
- At each scheduled boundary, UIX **must** capture and commit participating cells. UIX **must not** invoke a nonparticipating cell's snapshot operation merely because that boundary occurred.
- Post-turn and post-run boundaries **must** apply to normal completion, failure, and cancellation after the relevant execution settles.
- Cancellation **must not** create an additional pre-run boundary.
- If a cell selects both post-turn and post-run, UIX **must** apply both boundaries at the end of the final turn and run.
- Unchanged values **must** use the existing persistence rules to suppress redundant state entries.
- Before replacing active Agent feature instances during reload, UIX **must** wait for prior restoration and then commit their current state, regardless of capture schedules.
- A feature instance whose restoration has not settled **must not** commit a new snapshot over the branch state it has not yet received.
- When UIX derives model context at a capture boundary, UIX **must** finish the applicable state commit first while preserving the human's original message.
- Selecting capture boundaries **must not** automatically change when UIX provides a feature's Agent context.

These completion requirements cover interruptions handled by UIX. They do not guarantee completion handlers after a hard process kill or machine crash.

### Restoration and generations

- Initial Agent-instance creation **must** restore active cells from the selected branch before that instance **may** commit new turn state.
- Session replacement, branch retarget, and feature reload **must** restore the target feature generation from the selected branch.
- UIX **must** record the exact cell generation used to begin restoration.
- Restore work for a replaced or disposed generation **must not** invoke its old callbacks or mark the replacement as restored.
- Equivalent concurrent restoration requests for one manager and registry generation **may** be single-flight.
- UIX **may** skip another restoration after the same manager and registry generation has already finished.

### Failure isolation

- If any persisted cell for one feature is invalid, UIX **must not** restore any cell for that feature.
- One feature's validation or restore failure **must not** prevent independent features from attempting restoration.
- Cells belonging to one feature restore in a deterministic order and stop after that feature's first restore failure.
- A feature-level restore failure completes that feature's restore phase but **must** remain diagnosable.
- A failed commit **must** return an error, and later work **must not** proceed as if the state were persisted.

These requirements isolate restoration attempts, not composition acceptance. [`feature-composition.md`](./feature-composition.md#preparation-readiness) requires successful restoration of the complete candidate before acceptance.

## Conformance

A conforming implementation demonstrates these outcomes:

1. Two cells from different features commit complete values, persist only changed values in later entries, and project their latest values from one branch walk.
2. Selecting either of two sibling branches restores only that branch's latest cell values and provides `undefined` to active cells absent from the branch.
3. Invalid persisted state for one feature prevents all of that feature's restore callbacks while an independent feature still restores. During composition candidate preparation, the failure rejects the complete candidate despite that independent success.
4. Initial activation restores before commit, and a commit attempt while restoration is pending is rejected or declined without overwriting durable state.
5. Reload commits the outgoing feature generation after its restoration finishes, ignores stale restore work from that generation, and restores the replacement before it can commit.
6. A pre-run commit makes participating cells' current state available before the prompt enters history and before applicable model context is derived. The human's message remains unaltered.
7. Post-run commit records participating cells' Agent-produced changes as the next branch baseline while suppressing an unchanged follow-up commit.
8. A feature history reader can retrieve its recent cell values but cannot address another feature's cells.
9. A cell without an explicit schedule captures pre-run and post-run, without capturing at intermediate post-turn boundaries.
10. A cell selecting pre-run and post-turn captures before submission and after each completed or interrupted turn, without an additional post-run capture.
11. A cell selecting both completion boundaries receives both after normal completion, failure, and cancellation where both boundaries apply. Unchanged values do not produce duplicate entries.
12. Changing a cell's capture schedule does not itself change when UIX provides its feature's Agent context.

## Degrees of freedom

A conforming implementation may choose:

- Internal registry, projector, and coordinator types.
- The physical session-entry encoding, as long as cell identity and selected-branch results remain stable.
- Equality and serialization implementations that preserve plain-JSON semantics.
- Whether independent features restore sequentially or concurrently.
- Whether equivalent restoration requests are single-flight.

These choices must not weaken branch isolation, complete-cell behavior, validation, protection from stale feature generations, or lifecycle ordering.

## Open questions

- What explicit preview contract, if any, should differ from restoring or rolling back the selected branch?
- How should UIX present a checkpoint when document, worktree, or database restoration fails partway through?
