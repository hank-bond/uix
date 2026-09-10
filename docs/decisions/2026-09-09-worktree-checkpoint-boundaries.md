---
summary: "Conversation branches own independent worktrees, with pre-run and post-turn checkpoints addressed by compact opaque IDs rather than a prescribed storage backend."
kind: explanation
status: accepted
---

# Worktree checkpoint boundaries

Each conversation branch owns an independent worktree across Agent-instance restarts. A new conversation starts from the primary workspace's committed user Git HEAD, with installed packages copied separately. Pending source edits are not imported.

Automatic checkpoints preserve file state without changing the user Git branch's HEAD or staging index. Capture occurs before a prompt enters history and after each model turn's tool execution settles, including handled failures and cancellation. There is no additional post-run capture.

Checkpoint IDs are compact, opaque, unique within a session, and permanently bound to immutable checkpoints. The specification does not prescribe a checkpoint backend, hash length, allocation algorithm, or retention-ref encoding. Worktrees and intentional project history still use Git.

Retained sessions preserve working files and checkpoint references. Closing a connection or stopping an Agent does not reclaim them. Explicit inactive-session deletion is the retention boundary.

The initial scope excludes execution in the primary worktree, nested workspaces, rollback, additional Agent branches per session, automatic pruning, and merge interfaces.

This decision supersedes [`2026-08-08-session-worktrees-and-turn-checkpoints.md`](./2026-08-08-session-worktrees-and-turn-checkpoints.md). It retains branch-owned worktrees and separation from intentional Git history, while replacing the prescribed checkpoint storage, capture timing, and initial retention policy.

[`workspace-file-state.md`](../specs/workspace-file-state.md) defines file-state behavior and conformance. [`feature-turn-state.md`](../specs/feature-turn-state.md) owns the capture boundaries. Their implementation state remains independent of this decision.
