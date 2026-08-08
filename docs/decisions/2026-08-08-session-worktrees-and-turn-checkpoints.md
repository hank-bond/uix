---
summary: "Workspace files version on git: sessions are git worktrees of the workspace repo (auto-initialized when absent), per-turn checkpoints commit to app-owned refs/uix/... refs (never the work branch), undo restores working-tree content from checkpoints, and the branch only moves through agent/user git operations. Merging to main is a normal git merge plus a review surface."
kind: explanation
status: accepted
---

# Session worktrees and turn checkpoints

## Context

Users need an undo button, optional isolation, and eventually concurrent agents. The exploration moved from a DocumentStore-centric file store toward git because git already provides tree-level versioning, branching, merging, and rollback — and because [Superset](https://github.com/superset-sh/superset) ships worktree-per-agent orchestration on the user's repo as a proven pattern. The chosen model keeps one git path everywhere instead of a git path plus a separate snapshot path.

## The model

**One path: every workspace is a git repo.** When the workspace sits inside an existing repo, that repo is the substrate. Otherwise UIX auto-initializes one (`git init`, the Superset `needsGitInit` pattern) with enclosing-repo detection so a directory inside a larger repo joins that repo rather than nesting blindly.

**Main is the repo directory itself** — the user-experienced location on the host. "Mount on main" means the agent works directly in the repo directory; a session worktree is the isolated alternative.

**Sessions are git worktrees.** Each session gets its own worktree. Concurrent agents each attach to a worktree (shared working directory when collaborating, separate ones when isolating). The attach primitive is agent × (worktree state context) × (execution context).

**Turn checkpoints commit to app-owned refs, never the work branch.** At each run boundary (after the agent's final message, asynchronously) the session's working tree is committed via plumbing — `git add -A`, `write-tree`, `commit-tree`, `update-ref`, then `reset --mixed` — onto `refs/uix/snapshots/<session>`. Skipped when the tree is clean. The work branch never moves from checkpoints; it moves only through explicit git operations (the agent's own git calls, or the user through a review surface).

**Meaningful commits are separate from checkpoints.** The work branch receives commits the user or agent chooses to make. Merging a session to main is a normal git merge plus a diff-review surface (a feature, Superset-style).

**Undo restores working-tree content from a checkpoint; the branch is untouched.** Undo is scoped to the agent's footprint, not whole-workspace restore. The undo itself is checkpointed so undo-of-undo works.

**Checkpoint-on-leave.** Every state-replacing transition — rollback, session switch, fork, materializing preview — first checkpoints the leaving state on the current session chain, skipping when clean. Only working-tree content can dangle; commits and refs are durable by construction. This is the "capture the state being left, then apply the target" invariant from [pane and file versioning](../design/pane-and-file-versioning.md), expressed in checkpoint terms.

**Forking.** Starting from a checkpoint creates a new session chain. The conversation graph (Pi session file) and the checkpoint graph fork in lockstep, bound by turn-state pointers (conversation node → checkpoint ref). Forking from a rollback point gives clean history without reversal commits.

**Interaction with meaningful commits.** When the undone work is exactly the tip commit, undo can drop or amend the tip. Otherwise undo restores in place (a later commit records a reversal in history) or forks. Undo never silently rewrites history; history surgery is explicit and recoverable because checkpoint refs retain the pre-surgery state.

**Session lifecycle.** Per-session storage accounting (objects reachable from the session branch plus checkpoint refs). Close-out is a summarization event — indexed for search, like Pi compaction — that drops the session branch and checkpoint refs and GCs unreachable objects to reclaim space. GC must never invalidate refs the conversation graph still references.

**Managed documents remain separate.** Canvas/Monaco document-store content stays its own authority with the same turn-state rollback semantics; the file layer is git.

## Known costs

- `refs/uix/*`, session branches, and their objects accumulate in the user's repo until close-out/GC — an intrusion a shadow repo would have avoided. Accepted: git GC handles it, and close-out reclaims.
- Isolated sessions are proposal-style: agent changes are not live in the user's editor until merge. "Mount on main" is the live escape hatch.

**Rejected:** shadow repo plus import/export discipline (revisit when the user's repo must stay pristine — hosted or shared repos); scratch-index checkpoints (UIX-owned worktrees get git's normal index); per-turn commits on the work branch (noisy history for coders); detached-HEAD checkpoints (unreferenced commits are GC'd); a two-path git-vs-snapshot undo (auto-init makes one path; a snapshot store returns only as a fallback where git init is impossible); full-workspace restore (not the goal); git LFS as a default backend (deferred until heavy in-workspace binaries make preview materialization costly — and respecting a user's existing LFS config is a correctness obligation regardless).

Related: [anchored base tools](./2026-08-08-anchored-base-tools.md), [host file-watcher primitive](./2026-08-08-host-file-watcher-primitive.md), [pane and file versioning](../design/pane-and-file-versioning.md), [rollback boundaries](../design/rollback-boundaries.md), [session worktrees and turn checkpoints plan](../../plans/session-worktrees-and-turn-checkpoints.md).
