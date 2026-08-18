---
summary: "Build the workspace-file state substrate: auto-initialized git per workspace, session-branch worktrees, and turn-boundary checkpoint commits on app-owned refs. Checkpoint restore covers checkpoint-on-leave, turn-state binding, close-out reclaim, and the diff-review/merge surface."
---

# Session-branch worktrees and turn checkpoints

## Intent

Implement the [session worktrees and turn checkpoints decision](../docs/decisions/2026-08-08-session-worktrees-and-turn-checkpoints.md): one git path for workspace files with isolated worktrees. The first primary-branch policy has one viewpoint per session, but the durable ownership grain is the session branch. It adds per-run checkpoint refs that never touch the work branch. Undo restores working-tree content from checkpoints. This is the load-bearing piece for the file editor, undo, concurrent agents, and later multi-Agent branches.

## Multi-Agent constraint

A workspace owns the shared Git repository and the service that issues worktree capabilities. One session branch owns each mutable checkout. One Agent has exclusive write ownership of that branch. The first implementation may physically provision one worktree per primary session. APIs and persisted refs still use `SessionTarget` viewpoint identity. A later session coordinator can then materialize several branch worktrees concurrently.

Forking from a conversation node creates a new branch checkout from that node's checkpoint ref. The new branch may bind a different named Agent composition. It retains independent Canvas, file, and future database state. Asynchronous Agent messages move conversation content between branches. They do not merge worktrees. File integration remains an explicit diff-review, cherry-pick, or merge operation. The target is checkpointed before application.

## Units (provisional. Each stops for review)

- **U0: Auto-init and repo detection.** `git init` non-repo workspaces. Enclosing-repo detection: `.uix/` excluded from file watching so repo churn never feeds back into imports.
- **U1: Viewpoint worktree lifecycle.** Create a worktree for each primary `SessionTarget`, or attach the initial viewpoint to main. Preserve session-branch keying for later concurrent branches. Branch at conversation checkpoints and prune on close.
- **U2: Run-boundary checkpoints.** Plumbing commits onto app-owned refs qualified by the session-branch viewpoint, skip when clean, and checkpoint before human submission and after the Agent's final message.
- **U3: Checkpoint restore and checkpoint-on-leave.** Restore the working tree from a checkpoint. Checkpoint the leaving state before every state-replacing transition (rollback, session switch, fork, materializing preview).
- **U4: Turn-state binding.** Conversation node → checkpoint ref. Fork conversation, checkpoint, and viewpoint checkout graphs in lockstep.
- **U5: Session close-out.** Per-session storage accounting. Summarization event (indexed, Pi-compaction-like). Drop session branch and checkpoint refs. GC with conversation-graph safety.
- **U6: Diff-review/merge surface.** Review a session worktree's changes and commit them meaningfully to the work branch. Merge to main. Drop/amend/fork handling when undo intersects meaningful commits.

## Open before implementation

- Retention bounds, and whether undo-after-meaningful-commit offers drop/amend/fork automatically or reports and waits.
- LFS timing for heavy in-workspace binaries (deferred. Correctness obligation to respect existing user LFS config regardless).
- Sequencing against the [anchored base tools](../docs/decisions/2026-08-08-anchored-base-tools.md) and [host file-watcher primitive](../docs/decisions/2026-08-08-host-file-watcher-primitive.md) decisions and the file editor MVP.
