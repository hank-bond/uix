---
summary: "Managed documents expose current content with a durable revision and immutable versions behind a neutral store. Conditional replacement prevents silent lost writes."
kind: reference
status: draft
---

# Managed documents

## Contract

A _managed document_ has a logical identifier, mutable current content, and immutable versions. The document store hides its files or database records from features.

Reading current content returns the content and a revision. Conditional replacement compares an expected revision and installs new content as one atomic operation. A stale write reports the winning revision instead of overwriting it.

A _revision_ is a durable concurrency token for the current content. It exists for staleness checks and conditional replacement. It is not a restoration identity, a retention root, or readable history. An immutable _version_ is the durable record that branch state selects for restoration.

## Boundary

The document store owns namespaces, logical identifiers, current content, revisions, atomic conditional replacement, immutable versions, and physical storage.

A feature owns content meaning, candidate preparation, adoption of new working state, and conflict behavior beyond whole-document revision checks. Canvas owns HTML normalization, line anchors, and authored-versus-derived content.

Feature turn state, or another branch-aware authority, records which immutable versions belong to a session branch. Creating a version does not select it automatically.

## Requirements

- Each feature **must** use its own document namespace.
- A feature **may** validate its document identifiers.
- A document identifier or version identifier **must not** expose a storage path.
- Each Agent viewpoint **must** have separate current content and revisions for an Agent-owned document.
- Connections to one Agent viewpoint **must** share that viewpoint's current content and revision.
- Immutable versions **may** share storage when their identities name the same data.
- Reading current content **must** return the content and its revision.
- A revision **must** stay stable while its current content stays unchanged, including across process restarts.
- A revision **must not** make historical content readable and **must not** act as a garbage-collection root.
- Conditional replacement **must** compare the expected revision and install the candidate content as one atomic operation.
- A stale expected revision **must not** change current content. The store **must** report the winning revision.
- A successful replacement **must** report the new revision.
- Writing current content equal to the existing content **may** keep the existing revision.
- A mutation that accepts an expected revision **must not** fall back to an unconditional write when the check fails.
- An unconditional clobber write **must** be a separate explicit operation. It must never be the retry path for a stale conditional write.
- Restoring an immutable version replaces current content and produces a new revision for that transition.
- An immutable version **must** preserve its content and feature-owned metadata.
- A version identifier **must** identify both the content and its metadata. Equal content with different metadata **may** have different version identifiers.
- Reading a version **must** reproduce its content and metadata.
- Creating a version **must not** change current content or branch state.
- A storage failure **must not** be reported as a successful write or version creation.

## Conformance

A conforming implementation demonstrates these outcomes:

1. Two feature namespaces can use the same local document identifier without collision.
2. Two Agent viewpoints have separate current content for one logical document. Two connections to one viewpoint see the same current content and revision.
3. A version restores its exact content and metadata. Restoring it produces a new current revision.
4. Two writers using one base revision race. Exactly one replaces, and the other reports the winning revision without changing content.
5. A stale write based on an older revision never overwrites current content that differs from it.
6. Features and persisted references contain no storage paths. The physical store can change without changing the feature API.

## Degrees of freedom

A conforming implementation may use hashes, counters, Git objects, database rows, ordinary files, or another storage format. A content-hash revision is acceptable when content returning to an earlier value reuses that revision. The store may deduplicate equal content and choose its own garbage-collection mechanism.

## Open questions

- Which roots protect versions from garbage collection?
- Does the store need document change events?
- Do text and binary documents use one API or separate APIs?
- What should reading an absent current document return?
