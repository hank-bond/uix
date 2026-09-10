---
summary: "Rebase workspace-file state implementation onto branch-owned worktrees, pre-run and post-turn checkpoints, opaque IDs, and explicit session deletion."
---

# Session-branch worktrees and turn checkpoints

## Status

Requires rebasing before implementation. [`workspace-file-state.md`](../docs/specs/workspace-file-state.md) defines the target behavior, with capture schedules owned by [`feature-turn-state.md`](../docs/specs/feature-turn-state.md). [`feature-composition.md`](../docs/specs/feature-composition.md) owns loading source and application configuration from each Agent's worktree.

The earlier units are withdrawn rather than retained as a competing implementation path. No implementation or review sequence is approved by this cleanup.

## Rebase constraints

- Each primary conversation branch owns an independent worktree. Direct Agent execution in the primary workspace is outside the initial scope.
- Provision from the primary workspace's committed HEAD, not its pending changes. Copy installed packages separately.
- Checkpoint before the prompt enters history and after each model turn's tool execution settles, including handled interruptions. There is no additional post-run capture.
- Use compact, opaque, session-unique checkpoint IDs with permanent immutable bindings. The specification does not choose the checkpoint backend or ID allocation algorithm.
- Retain working files and checkpoints across connection closure and Agent restart. Reclaim session-owned state only through explicit inactive-session deletion.
- Keep rollback, fork orchestration, automatic pruning, and merge interfaces outside the initial implementation.

## Provisioning layout

The proposed local layout groups session-owned files on the workspace volume:

```text
<workspace>/.uix/sessions/
  <session-id>/
    <history>.jsonl
    branches/
      <branch-id>/
        worktree/
```

Keep shared Git objects, Git administrative metadata, and managed document storage outside session directories. Worktree deletion still needs Git administrative cleanup. This layout supports copy-on-write provisioning but is not a public addressing requirement. Confirm filenames and directory encoding when planning the implementation.

## Checkpoint implementation notes

Git-backed checkpoints remain an implementation candidate. The earlier sketch used worktree-local refs to retain automatic snapshots in shared Git object storage. Those refs are retention mechanics, not consumer-facing checkpoint identities.

A Git implementation must preserve the user's branch HEAD and staging choices. Use the UIX Git identity for automatic checkpoint commits without changing user configuration.

Choose compact ID encoding and allocation during implementation planning. Do not reinstate the withdrawn eight-character hash-prefix algorithm as a specification requirement. Resolve references through permanent checkpoint identity, not an abbreviation that can change meaning as objects accumulate.

File-reference parsing must distinguish the chosen ID encoding from literal filenames. Keep one parser behind the reference wrapper and retain the separate-argument reader for ambiguous filenames.

## Preparation questions

- How does provisioning preserve clone sharing while creating independent Git worktrees and installed packages?
- How are checkpoint contents, retention, and session references completed without announcing an unavailable checkpoint?
- How does the chosen ID encoding interact with file-reference parsing and storage retention?
- How does the implementation preserve existing Git filters, including large-file storage, without presenting transformed bytes as exact historical file contents?

## Earlier planning summary

- **Approach:** One Git repository, session-branch worktrees, and automatic checkpoint refs, followed by rollback and merge interfaces.
- **Retained:** Branch ownership, independent working files, and separation from intentional user Git history.
- **Superseded:** Optional execution on main, post-run-only capture, pruning on close, and initial rollback or merge work.
- **Promoted:** Observable ownership, timing, retention, and file-reading behavior belong in the workspace-file state specification.
- **Unresolved:** Physical provisioning, checkpoint storage, ID allocation, and reference parsing need a reviewed implementation plan. This record contains planning history, not evidence of a completed implementation.
