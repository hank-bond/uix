---
summary: "Design thread for versioning, history, and rollback of pane documents and (optionally) the user's working tree, both backed by git and linked to pi's conversation tree. Read before working on the .uix object store, conversation-node restore points, per-run file snapshots, or the rollback UI. The anchored edit channel that sits in front of this is a sibling thread (canvas-data-channel)."
status: exploring
---

# Pane and file versioning

## Current synthesis

**Frame.** This is the layer _behind_ the [canvas-data-channel](./canvas-data-channel.md) content-store seam (`getCurrent` / `commit` / `diff`). The channel only needs current content + diff; this thread is how versions persist, branch with pi's conversation tree, and roll back. Two stores — the **owned pane store** (always on) and the **opt-in user-file store** — are **wholly separate implementations** that share only two things: **git as the backend**, and a small **conversation-node meta slot**. Everything else (who writes, cadence, branching mechanics, restore safety, gc domain) differs, because one tree we own and the other we borrow.

**Why git at all.** For panes there is no existing version control, so we'd otherwise hand-roll content-addressing, dedup, and gc — git already is that. For files, the content-addressed store _already exists_ (`.git`), so the alternative would be reimplementing git beside the user's real git. Either way the answer is git; the only variable is which git primitive, which differs by who owns the working tree.

**Owned pane store (`.uix`).** A **bare git repo** driven by **plumbing, not porcelain and not stash** (`hash-object` / `mktree` / `commit-tree` / `update-ref`). git shas play the "content hash / object id" role; line anchors stay assigned single-token IDs (the channel's concern, not git's). Properties:

- **Emergent branching, not a mirrored tree.** Conversation nodes hold `{docId: sha}` pointers; pi's conversation tree is the _only_ place branch structure lives. A new edit after a rollback commits with the selected node's sha as parent — two children of one commit _is_ a branch in the DAG, drawn by parent links. We never maintain git branches that mirror the conversation tree (that would be two trees to keep in sync). Copy-on-write falls out: unchanged panes just carry the same sha to the next node.
- **gc off.** pi never deletes conversation branches, so the graph is append-only and permanent; set `gc.auto=0` and let `.uix/objects` grow monotonically (small text). Per-tip refs become optional — the conversation nodes are the index — though a thin ref namespace is cheap if enumeration wants it.
- **Restore is free/safe** because we own every write; the channel's editor re-derives anchors from whatever content the store hands back.

**Opt-in user-file store (the project's own repo).** Configurable, off by default. Requires the project be a git repo; **no rollback for out-of-project files**.

- **Non-destructive snapshot primitive.** Not `git stash` push (reverts the working tree), not `git stash create` (non-destructive and returns a commit, but misses untracked files and leaves an unreffed, prunable commit), and not the index (one slot → only one level deep, which is why staging-to-checkpoint caps out). Instead, snapshot into a **scratch index** so the user's real staging area is untouched: `GIT_INDEX_FILE=$tmp git add -A` → `write-tree` → `commit-tree -p <prev>` → `update-ref`. This captures untracked/new files, respects `.gitignore` (no build junk), is arbitrarily deep, and never disturbs the working tree.
- **Cadence = per run, not per agent turn.** Snapshot fires at **user-submit** (the pre-run baseline = end of previous run + any human edits) and at **rollback-initiation** (capture the trailing state before jumping away, so nothing is ever lost). Interruptions aren't their own trigger — partial state folds into the next baseline. This is coarser than the pane store (which versions per agent edit) by design: files checkpoint at run boundaries, panes continuously.
- **Emergent branching** via the same parent-chaining (parent each snapshot off the previous), so file history rides the conversation tree like the pane store, and you only need a ref per branch tip (these commits live in the _user's_ gc domain, so refs keep them reachable).
- **Restore is non-destructive by construction:** snapshot-then-apply. Rolling back first snapshots the current working tree, then applies the target — so even the user's own uncommitted edits are recoverable. This supersedes any "refuse on dirty / divert to worktree" guard. Restore stays a deliberate, user-driven action; _auto-restore never happens_.
- **Async labels.** Snapshots are auto-created unlabeled; the user clicks any snapshot in the UI and names it whenever (labels are mutable app/meta state, never baked into git ref or object names). A labeled snapshot signals "keep this" → promote it to a durable `refs/uix/checkpoints/<name>`; unlabeled per-run snapshots stay thin/prunable. Labels are what the branch/rollback picker shows (prompt text isn't memorable).
- **Manual checkpoint = a pinned per-run snapshot.** Same objects; "checkpoint now / review the delta since" is just labeling, plus `git diff <snapshot>` (working tree vs mark) or `git diff <a> <b>` (between marks).

**Shared contract — the conversation-node meta slot.** The single coupling between the two stores. Each subsystem reads/writes only its slice:

```
conversationNode.uix = {
  panes:        { "canvas/main": <sha>, ... },   // always present (owned store)
  userSnapshot?: { sha, label? }                  // present only if user-file mgmt enabled
}
```

**User-submit is the single sync boundary** for both stores. At submit, before the run dispatches: pending _human_ pane edits commit, the file snapshot is taken, and the node's `{panes, userSnapshot}` pointers are written — one coherent moment. (Pane _agent_ edits commit continuously during the run; only the human-side pending edits and the per-run file snapshot wait for this boundary. The other snapshot trigger, rollback-initiation, is symmetric: capture-before-you-leave.)

**Rollback model.** Stepping the conversation tree is a transient _preview_ (shows the panes/files for a node so the user picks a restore point visually). Rollback is one graph interaction with append-only actions, each optionally summarized: **conversation-only** (new pi branch from the node, don't commit previewed pane/file state); **pane-only** (stay at current head, copy the node's pane content into a new commit); **files** (snapshot-then-restore the working tree from the node's `userSnapshot`); **both/all** (new pi branch + check out the node's pointers). No action mutates old conversation nodes or commits.

**Hosting compatibility.** Both seams survive the move to hosted/VM: a bare git repo is an excellent hosting-compatible object store (push/pull, volume-backed, post-commit hook → the change-feed/pub-sub), and the user workspace stays a snapshot-able git volume. This builds directly on [hosting-compatible-by-default](../decisions/2026-05-31-hosting-compatible-by-default.md).

## Open questions / spikes

1. git library vs shelling out — prefer in-process (isomorphic-git or a libgit2 binding) so it runs identically local + hosted and doesn't fork per commit. Spike both stores against it.
2. Owned store: a **ref per doc** vs a **path-in-tree** per doc. Refs branch more naturally with the conversation tree; paths give simpler multi-doc atomic commits.
3. Exact commit metadata shape (`docId`, parents, author, optional summary) and precisely where conversation nodes store the pointers in UIX-owned pi sessions.
4. User-file store: do we plant `refs/uix/...` for _auto_ (unlabeled) per-run snapshots to survive the user's gc, or accept that auto snapshots are ephemeral and only _labeled_ ones get durable refs? (Lean: ephemeral auto, durable on label — minimal footprint in the user's repo.)
5. Rollback UI: how the conversation-only / pane-only / files / all actions are presented, and whether restore offers in-place vs into-a-worktree.
6. Pane-revision conflict handling: results expose commit ids for observability; do conflict-sensitive calls also accept an optional expected commit id, or is reject-on-stale-anchor-intersection enough?

## Spawns

- Parent design thread: [canvas-data-channel](./canvas-data-channel.md) (the anchored channel in front of this seam; units P0–U2).
- Decisions: [hosting-compatible-by-default](../decisions/2026-05-31-hosting-compatible-by-default.md) is the landed constraint; the git-backend + two-store split becomes its own decision once the spikes above resolve.
- Plan: build units U5–U6 (pane versioning + rollback) and U7 (opt-in user-file rollback), sequenced _after_ the P0–U2 channel proof per the value-first ordering.

## Log

### 2026-06-02 — split out from canvas-data-channel

Spun this thread out of [canvas-data-channel](./canvas-data-channel.md) once it was clear versioning is a separate concern from both the anchored editor and the channel itself, and that the editor's regenerable state lets versioning sit entirely behind the content-store seam (so it sequences _after_ the channel proof). Resolved the backend to git for both stores, with the primitive differing by ownership: bare-repo plumbing commits for the owned `.uix` pane store (emergent branching from parents, `gc.auto=0`, no mirrored conversation refs), and scratch-index `write-tree`/`commit-tree` snapshots for the borrowed project repo (per-run cadence at user-submit + rollback, non-destructive snapshot-then-apply restore, async labels promoting to durable refs). Pinned the two-store separation down to its single shared contract — the conversation-node meta slot — and confirmed the rollback action set (conversation-only / pane-only / files / both) stays append-only. Echo-suppression dropped as a non-issue: the canvas uses internal eventing, not fs-watch, so the agent's own edit never returns as a phantom human change.
