---
summary: "Build the workspace-file state substrate: auto-initialized git per workspace, session worktrees, and turn-boundary checkpoint commits on app-owned refs. Checkpoint restore covers checkpoint-on-leave, turn-state binding, close-out reclaim, and the diff-review/merge surface."
---

# Session worktrees and turn checkpoints

## Intent

Implement the [session worktrees and turn checkpoints decision](../docs/decisions/2026-08-08-session-worktrees-and-turn-checkpoints.md): one git path for workspace files with session worktrees. It adds per-turn checkpoint refs that never touch the work branch. Undo restores working-tree content from checkpoints. This is the load-bearing piece for the file editor, undo, and concurrent agents.

## Units (provisional. Each stops for review)

- **U0: Auto-init and repo detection.** `git init` non-repo workspaces. Enclosing-repo detection: `.uix/` excluded from file watching so repo churn never feeds back into imports.
- **U1: Session worktree lifecycle.** Create a worktree per session (or attach to main), branch off at conversation points, prune on close.
- **U2: Turn-boundary checkpoints.** Plumbing commits onto `refs/uix/snapshots/<session>`, skip-when-clean, asynchronous after the agent's final message.
- **U3: Checkpoint restore and checkpoint-on-leave.** Restore the working tree from a checkpoint. Checkpoint the leaving state before every state-replacing transition (rollback, session switch, fork, materializing preview).
- **U4: Turn-state binding.** Conversation node → checkpoint ref. Fork conversation and checkpoint graphs in lockstep.
- **U5: Session close-out.** Per-session storage accounting. Summarization event (indexed, Pi-compaction-like). Drop session branch and checkpoint refs. GC with conversation-graph safety.
- **U6: Diff-review/merge surface.** Review a session worktree's changes and commit them meaningfully to the work branch. Merge to main. Drop/amend/fork handling when undo intersects meaningful commits.

## Open before implementation

- Retention bounds, and whether undo-after-meaningful-commit offers drop/amend/fork automatically or reports and waits.
- LFS timing for heavy in-workspace binaries (deferred. Correctness obligation to respect existing user LFS config regardless).
- Sequencing against the [anchored base tools](../docs/decisions/2026-08-08-anchored-base-tools.md) and [host file-watcher primitive](../docs/decisions/2026-08-08-host-file-watcher-primitive.md) decisions and the file editor MVP.
