---
summary: "Feature turn state records each feature's small private snapshots on the Pi session branch and restores them before the feature resumes work."
kind: reference
status: draft
---

# Feature turn state

## Contract

_Feature turn state_ gives each Agent feature instance small, private, durable state on the Pi session branch. A feature divides that state into named cells that can change independently. Each cell declares a TypeBox schema, an operation that returns its complete value, and an operation that restores that value.

UIX validates and persists cell snapshots, derives the selected branch's latest cell values, and restores each feature. UIX does not interpret the values.

Turn state is hidden from the model. A feature may use its committed history to derive separate model context, but the turn-state entries do not become conversation content.

## Dependencies

This specification depends on [`agent-viewpoints.md`](./agent-viewpoints.md) for selected-branch identity and for any UIX-owned operating state recorded beside feature cells. It also follows Pi's append-only session tree, Agent feature-instance lifetimes, TypeBox validation, contribution identity, and the exported turn-state APIs.

## Boundary

UIX assigns stable cell identities, appends branch entries, derives the selected branch's current values, and orders commits and restoration. It provides cell history, ignores restore work from old feature generations, and prevents one feature's failure from stopping another.

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
- A cell's restore operation **must** replace its working state from the supplied complete value. `undefined` means restore feature-defined defaults.

### Persistence

- Turn state **must** be persisted as host-private entries in the Pi session tree. Those entries **must not** appear in the model or human transcript by default.
- Each entry **may** sparsely contain only cells whose complete values changed from the nearest upstream committed values.
- UIX **must** suppress a commit when no active cell or UIX-owned viewpoint field in the entry has changed.
- UIX **must** validate persisted values against their active schemas before restoration.
- UIX **must** validate cell snapshots before appending an entry. An invalid snapshot **must** reject the commit without writing branch state.
- Turn-state entries **must** preserve unknown or inactive feature data in the durable session tree even though the current branch view contains only active cells.
- Documents, filesystems, and databases should remain in their own stores. A cell **may** record a stable reference without making turn state interpret the referenced data.

### Branch values and history

- UIX **must** derive turn state solely from the selected session branch.
- UIX **must** read entries from the session root to the selected leaf and retain the latest value for each active cell.
- Values from a sibling branch **must not** appear in the selected branch's turn state.
- A feature **must** receive history access only for its own cell names.
- History **must** preserve branch order and support bounded recent reads without exposing another feature's private cells.
- After branch selection changes, UIX **must** restore from the newly selected branch rather than from old in-memory state.

### Commit boundaries

- Before a user prompt begins an Agent run, UIX **must** commit current feature turn state. The branch then records the state the Agent is about to observe.
- After an Agent run finishes or fails, UIX **must** commit changed feature turn state. The next run then starts from state changed by the Agent.
- Before replacing active Agent feature instances during reload, UIX **must** wait for prior restoration and then commit their current state.
- A feature instance whose restoration has not settled **must not** commit a new snapshot over the branch state it has not yet received.
- UIX **must** commit before it derives model context for the run, while preserving the human's original message.

### Restoration and generations

- Initial Agent-instance creation **must** restore active cells from the selected branch before that instance **may** commit new turn state.
- Session replacement, branch retarget, and feature reload **must** restore the active feature generation from the selected branch.
- UIX **must** record the exact cell generation used to begin restoration.
- Restore work for a replaced or disposed generation **must not** invoke its old callbacks or mark the replacement as restored.
- Equivalent concurrent restoration requests for one manager and registry generation **may** be single-flight.
- UIX **may** skip another restoration after the same manager and registry generation has already finished.

### Failure isolation

- If any persisted cell for one feature is invalid, UIX **must not** restore any cell for that feature.
- One feature's validation or restore failure **must not** prevent independent features from attempting restoration.
- Cells belonging to one feature restore in a deterministic order and stop after that feature's first restore failure.
- A feature-level restore failure completes that feature's restore phase but **must** remain diagnosable.
- A failed commit **must** be reported as a failure, and later work **must not** proceed as if the state were persisted.

## Conformance

A conforming implementation demonstrates these outcomes:

1. Two cells from different features commit complete values, persist only changed values in later entries, and project their latest values from one branch walk.
2. Selecting either of two sibling branches restores only that branch's latest cell values and provides `undefined` to active cells absent from the branch.
3. Invalid persisted state for one feature prevents all of that feature's restore callbacks while an independent feature still restores.
4. Initial activation restores before commit, and a commit attempt while restoration is pending is rejected or declined without overwriting durable state.
5. Reload commits the outgoing feature generation after its restoration finishes, ignores stale restore work from that generation, and restores the replacement before it can commit.
6. A pre-prompt commit makes current cell state available when UIX builds model context without altering the human's submitted message.
7. Post-run commit records Agent-produced changes as the next branch baseline while suppressing an unchanged follow-up commit.
8. A feature history reader can retrieve its recent cell values but cannot address another feature's cells.

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
