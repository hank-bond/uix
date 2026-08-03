---
summary: "Exploring managed-document history and optional workspace checkpoints across version backends, retention, preview, non-destructive rollback, Git state, and cwd transitions."
kind: explanation
status: exploring
---

# Pane and file versioning

## Current synthesis

### Implemented baseline

The implemented document substrate stores mutable current bytes and immutable JSON versions behind `DocumentStore`. Canvas turn state points from each resource id to a version id, so Pi's branch graph selects document state without duplicating document bytes.

Canvas versions include anchored metadata. Restoration therefore recovers content and anchor continuity together. Missing metadata can degrade to regenerated anchors without making that fallback authoritative.

A buffer remains a live feature-owned projection over a store. Versioning belongs behind the store interface; surfaces and agent tools should not depend on local version-file paths.

### Two authorities, not one rollback promise

UIX owns managed document history, while the user's Git working tree remains externally owned. These stores may share checkpoint coordination, but they do not share write authority, retention, restore safety, or garbage collection.

Managed documents can guarantee atomic restoration of content and feature metadata because every write crosses their store. Workspace files also have external writers, ignored paths, staging state, and working-directory coordinates. A combined action must not imply atomic reversal unless a coordinator can state and enforce that guarantee.

### Managed-document history proposal

Git remains a candidate backend, not a settled decision. The original proposal used a UIX-owned bare repository and plumbing operations such as `hash-object`, `mktree`, `commit-tree`, and `update-ref`. Git objects would provide content addressing, deduplication, parentage, and packing without exposing repository paths to callers.

Conversation branches should not be mirrored as Git branches. A turn-state cell can point from each resource id to an immutable version. Parent links between versions provide emergent branching when an edit follows a restored ancestor. Pi's graph remains the only user-visible branch structure.

A document version must identify content and feature-owned metadata together. For Canvas, anchor map and allocation index belong to the same version as the bytes. Restoring only one half would produce stale historical anchors or a false edit guard.

Mutable current state remains separate from immutable versions. Human and Agent writes update the working document, while run-boundary state records which immutable version became branch-visible. Intermediate versions may exist without becoming conversation checkpoints.

If Git is used, retention cannot rely on process-local reachability. The design must decide whether session references, a derived ref namespace, or explicit checkpoint refs keep versions alive. Automatic Git garbage collection must not silently invalidate durable session pointers.

### Optional workspace-checkpoint proposal

Workspace checkpoints must not use `git stash push` because it mutates the working tree. `git stash create` is also insufficient by itself: it omits untracked files and leaves an unreferenced object.

The retained proposal uses a scratch index. Set `GIT_INDEX_FILE` to a temporary index, add the working tree, write a tree, create a parented commit, and update a UIX-owned ref. This can capture tracked and untracked non-ignored files without touching the user's real index or working tree.

Checkpoint cadence should be coarse. Capture a pre-run baseline after human edits and capture again before applying an older checkpoint. Interruptions can fold into the next baseline rather than creating a snapshot for every partial event.

Restore remains non-destructive by construction: capture the state being left, then apply the target. A user can recover the pre-restore working tree even when it contained uncommitted edits.

Automatic snapshots and named checkpoints may have different retention. A label can pin a durable ref, while unlabeled run snapshots may follow a bounded retention policy. Labels are application metadata rather than Git object names, so they can change without rewriting history.

### Shared turn-state contract

Heavy state belongs behind stable refs, not inside session JSONL. Each turn-state cell owns its schema, snapshot, and restore behavior. The coordinator validates and persists opaque cell values without understanding document or Git internals.

Run boundaries are durable synchronization points. Before a user run, each participating authority captures stable state, then the session records the refs. After an Agent run, changed managed documents can establish the baseline that the Agent most recently observed.

Workspace resources need cwd-aware coordinates, while managed document ids remain cwd-independent. A future `workspace://` identity should record a path relative to the turn's working-directory coordinate. A `doc://` identity continues to resolve through its content store in any worktree.

A working-directory transition should capture state before leaving and materialize only the selected node's relevant workspace refs into the destination. Historical turns keep their original cwd as part of their coordinate system.

### Preview and rollback

Preview must not silently become restore. Selecting an old conversation node can display historical managed documents or workspace state without changing current authority. A later action explicitly chooses what to carry forward.

The retained action split is:

- **Conversation only:** Branch from the selected Pi node without applying previewed document or workspace state.
- **Managed documents only:** Copy selected versions into new current versions while staying at the current conversation head.
- **Workspace files:** Capture the current tree, then apply the selected workspace checkpoint.
- **Explicit combination:** Coordinate conversation, documents, and files while reporting any authority that cannot participate.

Every action appends new state. No rollback action mutates historical session entries or version objects.

### Hosting constraint

Any backend must preserve stable ids, immutable versions, and a change feed without making local paths authoritative. A bare Git repository can satisfy that constraint locally or on a volume, but hosted object storage can implement the same store contract. The choice remains behind the document and checkpoint interfaces.

## Open questions

- Does managed document history need Git semantics, or are immutable store versions with explicit parent metadata sufficient?
- Should one managed-document version cover multiple resources atomically, or should each resource retain an independent parent graph?
- What keeps session-referenced versions reachable, and what retention applies after branches become unreachable?
- How should preview expose historical documents without mutating current buffers or triggering ordinary change effects?
- Can scratch-index checkpoints preserve submodules, sparse checkouts, file modes, and platform-specific paths without surprising behavior?
- Which automatic snapshots receive refs, and when may unlabeled snapshots be pruned?
- How do restore conflicts interact with external writers or another UIX process?
- What cwd and worktree metadata must accompany a workspace checkpoint?

## Spawns

- Parent design: [`canvas-data-channel.md`](./canvas-data-channel.md).
- Rollback vocabulary: [`rollback-boundaries.md`](./rollback-boundaries.md).
- Hosting constraint: [`2026-05-31-hosting-compatible-by-default.md`](../decisions/2026-05-31-hosting-compatible-by-default.md).
- Session pointer decision: [`2026-06-06-session-file-as-state-substrate.md`](../decisions/2026-06-06-session-file-as-state-substrate.md).
- Active implementation context: [`persistence-and-session-foundation.md`](../../plans/persistence-and-session-foundation.md).

## Log

### 2026-06-21 — central coordinator lands; contribution-keyed opaque state; channel-vs-store split

The central state lifecycle from the 2026-06-17 entry landed as `src/main/turn-state/` — a thin `TurnStateRegistry` + coordinator that appends `uix.turn-state` at the submit and agent-end boundaries; the canvas no longer owns that append, it provides a `TurnStateContribution` (`src/features/canvas/backend/contributions/turn-state.ts`) registered by the turn-state substrate. Several refinements settled while scoping the next step (the restore half):

- **Key state by contribution id.** The coordinator must not know any contribution payload's shape — it persists and routes an opaque, JSON-serializable state payload per contribution id, never a flat `panes` map. "Pane" is the pane-host's vocabulary (mounting/slots), not the snapshot substrate's; pane coordination needs no pane-keying in `uix.turn-state`. This deletes the `panes` shape and the duplicate-pane merge guard (collisions become structurally impossible). A `kind` tag is deferred until a substrate consumer actually needs to treat a class of contribution state uniformly.
- **Restore is the contribution's job, and it _is_ the generalization.** Each contribution owns both halves — prepare state and restore/preview that state later. Adding the restore half is what forces the state payload opaque: the coordinator stops interpreting `panes` and just hands a contribution back its own payload. So we don't generalize `PreparedState` as a speculative step and then bolt restore on; building restore against the real canvas consumer _produces_ the generalization. C4 anchor rehydration folds into the canvas restore hook (it resolves `getVersion` content + anchor meta together as one unit).
- **cwd is substrate-owned.** The content store stays purely id-addressed and path-unaware (hosting invariant), so the "where do restored bytes land" mapping cannot live in the store; it lives in the contribution (semantics) plus the turn's cwd coordinate, which the coordinator records. Path-bound restores (the user-file store) resolve destinations against it.
- **Channel vs store split, and the rename.** `DocumentChannel` → `CanvasDocumentBuffer`: it is the canvas feature's live working copy over the store (read/write/edit + sync + diffs), not a transport and not a universal document abstraction — "channel" now names only message conduits (IPC, the pane↔agent bus). The content store is the shared substrate primitive (id→current bytes + versions + opaque meta); each feature owns a thin, purpose-named buffer that composes it with its own validate/format pre-store step. Anchoring is a reusable _text_ concern, not universal — a React/JSON state pane would skip anchors entirely and bring schema-validate + stable-stringify instead, sharing only the store. The coordinator stays store-blind, and the store has heavy use outside the snapshot flow (live editing, the `uix-resource://canvas.<workspace>/doc/...` render path).
- **Document kind + exact source ids.** The next document-engine shape separates semantic purpose from mechanical projections. A feature registers a document kind (for canvas: canonical HTML for canvas documents), and every writer produces a candidate that the kind normalizes before a snapshot becomes truth. Write notifications are ref-based — `{ resourceId, kindId, sourceId, beforeSnapshotId, afterSnapshotId, normalized }` — so listeners fetch/diff only when they need to. Feature sources use feature namespaces (`canvas.pane.writeback`, `canvas.agent.anchor_edit`); substrate sources use `uix.*` (`uix.document.restore`). Canvas itself is not privileged core: it is a default feature that contributes its kind, pane, tools, state contribution, and listeners.

### 2026-06-17 — snapshot state belongs to central state lifecycle

After the first canvas snapshot implementation, refined the ownership model: latest/version storage is generic, anchor metadata is buffer-owned, and run-boundary orchestration belongs to a central turn-state substrate. Canvas should contribute opaque state (snapshot ids, not prepared diffs), not directly own the whole `uix.turn-state` append path forever. The same pattern is needed for JSON app-state documents and externally hosted state: perform the side effect in the owning store, persist the stable refs/state in the session tree, render any model-visible context from that committed state, and restore through the contribution's counterpart hook during branch preview/rollback.

### 2026-06-13 — mutable latest plus durable run-boundary snapshots

Refined the owned pane store around two layers. **Latest** is a mutable working file: the app always loads it on startup, iframe writebacks overwrite it, and agent tools update it during a run. **Snapshots** are immutable git versions carrying content plus anchor metadata. A snapshot becomes part of UIX history only when a `uix.turn-state` `CustomEntry` points at it; unreferenced git objects created as an implementation detail are ephemeral, not rollback nodes.

Durable cadence is run-boundary, not per writeback. At user submit, before the user message is added, UIX snapshots latest and records the pointer; the agent-visible canvas diff is derived from the nearest upstream turn-state snapshot to this new snapshot. At `agent_end`, if the agent changed latest through canvas tools, UIX snapshots final latest and records a post-run pointer. This gives the next user turn a baseline matching what the agent observed through tool results, while avoiding noisy per-keystroke/per-tool durable history. Richer undo stacks can later add more referenced snapshots without changing the branch-pointer model.

### 2026-06-09 — anchor state moves into commit meta; restore confirmed at turn boundaries

Out of the durable-identity walk ([conversation-render-primitives](./conversation-render-primitives.md) log of the same date): the anchored editor's state (anchor↔line map + allocation index) homes in the **version's commit meta**, not a session `CustomEntry` (the earlier C4 idea) and not a loose sidecar. Rationale: anchor state is a function of the document's edit history up to a commit, so storing them together makes rewind/restore atomic and necessarily consistent — the C3 `uix.turn-state` pointer stitches turn → version → `{content, anchors}` with no second lookup. This partially answers the open commit-metadata-shape question (spike 1/open-Q 3 residue): meta includes `{anchorMap, allocIndex}` at minimum. It also revises the "editor re-derives anchors from whatever the store hands back" line — re-derivation is now the _fallback_ (renumbered, match-guard as last resort, cost = re-injecting the doc into context), not the restore path. Restore granularity is confirmed at **turn boundaries** (matching pi CLI): the store versions every modification, but pointers — and therefore preview/rollback targets — are per-turn. Diff/delta compression stays explicitly deferred to the git-backed store (packfiles); the trivial store keeps full per-version meta and blobs.

### 2026-06-06 — session file resolves the pointer-home question

Researched pi's session file format: an append-only JSONL tree where every entry has `{id, parentId}` and pi ships `CustomEntry`/`CustomMessageEntry` for arbitrary extension state. This **is** the conversation-node meta slot — `{docId: sha/versionId}` pointers ride pi's tree as `CustomEntry` (resolving open-Q #3), so the "emergent branching off conversation nodes" model needs no parallel tree. Write access requires holding pi's `ExtensionAPI` (`appendEntry`), which forces promoting UIX-core bindings from `customTools` to an in-process pi extension — captured in [session-file-as-state-substrate](../decisions/2026-06-06-session-file-as-state-substrate.md). The git-backed owned-pane store from this thread stays the impl behind the versioned `DocumentStore` seam (plan C2); spikes 1–6 above (git library, ref-per-doc vs path-in-tree, etc.) are still open and gate that store specifically. Build sequencing now lives in [persistence-and-session-foundation](../../plans/persistence-and-session-foundation.md) (C2 store, C3 pointers, C4 anchor continuity, C5 rollback = this thread's U5–U6).

### 2026-06-02 — split out from canvas-data-channel

Spun this thread out of [canvas-data-channel](./canvas-data-channel.md) once it was clear versioning is a separate concern from both the anchored editor and the channel itself, and that the editor's regenerable state lets versioning sit entirely behind the document-store seam (so it sequences _after_ the channel proof). Resolved the backend to git for both stores, with the primitive differing by ownership: bare-repo plumbing commits for the owned `.uix` pane store (emergent branching from parents, `gc.auto=0`, no mirrored conversation refs), and scratch-index `write-tree`/`commit-tree` snapshots for the borrowed project repo (per-run cadence at user-submit + rollback, non-destructive snapshot-then-apply restore, async labels promoting to durable refs). Pinned the two-store separation down to its single shared contract — the conversation-node meta slot — and confirmed the rollback action set (conversation-only / pane-only / files / both) stays append-only. Echo-suppression dropped as a non-issue: the canvas uses internal eventing, not fs-watch, so the agent's own edit never returns as a phantom human change.
