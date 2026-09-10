---
summary: "UIX gives each conversation branch an independent worktree and immutable file checkpoints addressed by compact, stable IDs."
kind: reference
status: draft
implementation: incomplete
---

# Workspace file state

## Contract

UIX gives each conversation branch an independent project worktree and automatic immutable file checkpoints. The branch owns that working state across Agent-instance restarts.

User Git history contains intentional project branches and commits. Automatic checkpoints preserve file state independently, without changing the user Git branch's HEAD or staging index. The checkpoint backend is an implementation choice, not part of the file-reading API.

Agents and feature backends read current or checkpointed files through a shared file API. Checkpoint IDs identify immutable versions without requiring consumers to understand their storage implementation.

## Dependencies

This specification depends on [`feature-turn-state.md`](./feature-turn-state.md) for capture schedules, interruption handling, and Agent-context delivery. It depends on [`agent-viewpoints.md`](./agent-viewpoints.md) for branch identity, worktree-root exposure, and the separation of Agent working state from branch identity. It follows the repository conventions, Pi's session and event model, and the exported TypeScript and TypeBox contracts.

## Boundary

Copy-on-write provisioning reduces duplication where the host supports it. It does not change worktree behavior or provide a security boundary.

The initial scope covers worktree provisioning and reuse, checkpoint capture, durable checkpoint references, Agent context, revision-aware file reads, and explicit session deletion. In this implementation, each session has one primary conversation branch. That branch owns the session's worktree and user Git branch.

The initial scope supports workspaces at the root of a Git worktree. Workspaces nested below that root and sparse-checkout provisioning are outside this implementation. The workspace directory and Git worktree root have distinct roles, even though their paths coincide in the supported layout.

External symlink targets are outside checkpoint coverage. Checkpoints capture symlinks as links rather than including the external targets' bytes.

[`feature-composition.md`](./feature-composition.md) defines loading feature code and application configuration from the session worktree. Dependency provisioning copies installed packages separately from checkpoint capture.

Rollback, automated integration and merge workflows, subagent orchestration, additional Agent branches per session, automatic pruning, diary compaction, and execution sandboxing are outside this first implementation. Persistent changes to the Agent's default working directory are also outside this scope. HTML-fragment rendering remains a separate feature and web-route concern.

## Requirements

### Repository bootstrap

- If the workspace directory is the root of an existing Git worktree, UIX **must** reuse its repository.
- If the workspace is nested below an enclosing Git worktree root, UIX **must** reject provisioning with an explicit unsupported-layout error. Rejection **must** precede repository or workspace changes.
- UIX **must not** work around an unsupported nested workspace by initializing another repository or copying the enclosing repository.
- If no repository exists, UIX **must** initialize one at the workspace directory.
- If user Git history has no commits, UIX **must** create an initial commit containing the workspace's eligible files. This requirement also applies when the repository already exists. The commit belongs to user Git history and provides the starting point for Agent worktrees.
- Creating the initial commit **must** establish a staging baseline matching that commit, replacing any pre-existing staging choices in the uninitialized user Git history.
- Bootstrap **must not** change existing working-file contents.
- When user Git history already contains commits, bootstrap **must not** change existing staging state.
- UIX **must** use its own Git identity for the initial user Git commit.
- UIX **must not** change the user's Git identity configuration to create that commit.
- Bootstrap **must not** change existing remotes.
- When user Git history already contains commits, bootstrap **must not** change its commits or branches. UIX **must not** automatically commit its pending changes.

### Worktree ownership

- Each conversation branch **must** own an independent worktree and user Git branch.
- UIX **must** provision that worktree and its copied dependencies before the branch's Agent first activates its feature composition.
- Agent-instance restarts **must** reuse the branch's existing worktree.
- The Agent's default working directory **must** be the worktree root.
- Each built-in Bash invocation **must** start in the worktree root with its own shell execution.
- A Bash command **may** change directories within its invocation. Shell-local directory or environment changes **must not** change the defaults of subsequent invocations.
- UIX **must not** provide direct Agent execution in the primary workspace worktree in the initial scope.

Creating a subagent does not inherently require another worktree. Explicit subagent isolation remains outside this first implementation.

### Session ownership

- UIX **must** associate each session's history and branch worktrees with that session for retention and deletion.
- This implementation **must not** migrate existing legacy flat session histories. Sessions with only legacy histories remain outside the managed worktree model and are not resumable through this feature.

Physical storage layout does not define session ownership.

### New-conversation starting state

- A new conversation **must** start from the primary workspace's user Git HEAD commit, not its pending working-file or staged state.
- The conversation's user Git branch and staging index **must** start at that same source HEAD commit, not at a checkpoint commit.
- The conversation's working files **must** reproduce that commit's contents, excluding UIX state under `.uix`. Installed packages follow the separate provisioning requirements below.
- Apart from installed dependency copying, provisioning **must not** import the source worktree's uncommitted modifications, deletions, or untracked files. This includes pending manifest and feature-source changes.
- UIX **must** capture the provisioned conversation worktree's eligible files as its initial checkpoint baseline.
- Provisioning **must not** change the source worktree's files, staging state, or checked-out branch.
- UIX **must not** require the user to commit pending changes before starting a conversation.

### Eligible files

- UIX state under `.uix` **must** be excluded from checkpoint capture and worktree copying, even if tracked by Git.
- Apart from excluded UIX state, checkpoint capture **must** include all tracked files, including their modifications and deletions.
- An otherwise eligible tracked file **must** remain eligible even when a Git ignore rule matches it.
- Checkpoint capture **must** include untracked files that Git does not ignore.
- Checkpoint capture **must not** include ignored, untracked files.
- Initial capture and subsequent checkpoints **must** use the same file eligibility rules.

### Installed dependencies

- New-worktree provisioning **must** copy existing `node_modules` directories from the source worktree, including root and nested feature or package installations.
- Dependency copying **must** include installed contents even when Git ignores them.
- UIX **must** copy the installed dependency directories intact rather than selecting only packages inferred to be feature dependencies.
- Dependency copying **must not** include excluded UIX state under `.uix`.
- UIX **must** apply the copy-on-write and independent-copy requirements to dependency provisioning.
- Copying dependencies **must not** change checkpoint eligibility. Ignored, untracked dependencies remain outside checkpoints.
- UIX **must not** require a fresh package installation merely to create a session when the source worktree already contains the required installed dependencies.
- Resuming an existing worktree **must** retain its installed dependencies rather than overwrite them from the primary workspace.
- Copying package-manager symlinks **must** preserve relative links within the copied project. Explicit external links remain external and do not gain worktree isolation.

Dependency provisioning provides the Agent's project environment. It does not replace the substrate's installation or its shared modules. Copying an absent or incomplete installation cannot provide missing packages.

### Copy-on-write provisioning

- UIX **must** use native copy-on-write cloning when the host and filesystem support it.
- When cloning is unavailable, UIX **must** fall back to ordinary independent file copies.
- Both provisioning paths **must** produce the same checkpointed file contents and Git behavior.
- Changes to files in one worktree **must not** modify another worktree's files. UIX **must not** use hard links between worktrees as a substitute for independent writable files.
- Git setup **must** preserve storage sharing established by cloning rather than unnecessarily rewriting cloned files.

Platform-specific bootstrap commands remain implementation details.

### Checkpoint timing and change signals

[`feature-turn-state.md`](./feature-turn-state.md) defines Agent turns, runs, capture schedules, and interruption handling.

- File checkpoint state **must** select pre-run and post-turn capture boundaries, without an additional post-run capture.
- Post-turn checkpoint capture **must** include partial eligible file changes left by interrupted tool execution.
- Capture **must** reflect all eligible file changes, regardless of whether an Agent, human, or external process made them.
- After establishing the initial baseline, UIX **must** create a checkpoint only when eligible file state differs from the preceding checkpoint.
- When capture produces a checkpoint, UIX **must** durably record its ID. UIX **must** provide that ID as an Agent context update before the next model invocation.
- Unchanged file state **must not** create a checkpoint or produce a checkpoint turn-state or Agent context update.
- UIX **must** announce the initial baseline checkpoint once. The absence of later updates **must not** clear the branch's recorded checkpoint ID.

### Checkpoint identity

- Checkpoint IDs **must** be compact, opaque values suitable for Agent context and file references.
- Each checkpoint ID **must** be unique within its session, including across sibling branches.
- Once issued, an ID **must** permanently identify the same immutable checkpoint.
- UIX **must** durably establish that identity before announcing the ID.
- Reopening a retained session **must** preserve its checkpoint identities and allow references to checkpoints from sibling branches.
- Agent context **must** receive the checkpoint ID without requiring backend revision identifiers or storage locations.

Backend selection, ID encoding, allocation, and collision handling remain implementation choices.

### File references

File references use these forms:

| Reference | Meaning |
| --- | --- |
| `src/example.ts:20-50` | Lines 20-50 from the current worktree. |
| `src/example.ts:20-50@p4m8k2r7` | Lines 20-50 from checkpoint `p4m8k2r7`. |
| `src/example.ts@p4m8k2r7` | The complete file from checkpoint `p4m8k2r7`. |

- Reference paths **must** be relative to the worktree root, independent of the Agent's working directory.
- Line ranges **must** be one-based and inclusive.
- A reference without a line range **must** identify the complete file.
- Omitting the checkpoint **must** select current worktree files. UIX **must not** require an explicit `@latest` suffix.
- A file reference **may** append a checkpoint ID after `@`, following any line range.
- Missing checkpoints or historical files **must** fail explicitly. Historical reads **must not** fall back to current files.
- An unknown checkpoint ID in a reference **must** fail explicitly rather than trigger a filename fallback.
- The separate-argument read function **must** treat its path argument literally. Callers **may** use it for filenames that conflict with reference syntax.

### Shared file reader

- UIX **must** provide one revision-aware file-reading capability to Agent tools and feature backends.
- The client **must** provide a read function accepting a file path, optional checkpoint ID, and optional line range as separate arguments.
- The client **must** also support reading through a file-reference string. Equivalent reference-string and separate-argument reads **must** return the same content.
- Without a checkpoint, the reader **must** read current worktree files.
- With a checkpoint, the reader **must** read immutable file contents without checking out that revision or modifying working files.
- The reader **must not** require consumers to execute Git commands or understand checkpoint storage.
- Underlying file content access **must** be byte-oriented so whole-file reads support binary assets as well as source code.
- Line-range selection **must** operate on text rather than arbitrary byte offsets.
- The reader **must** own file resolution and content access. Agent tools and fragment handlers **must** own presentation of returned content.
- Web-route handlers **must** own escaping, highlighting, and HTML rendering for their responses.
- The reader **must** confine file paths to the worktree root. A path that escapes the worktree root **must** fail.
- Checkpoint capture **must** record symlinks as links without capturing external targets. A checkpointed read of a symlink outside the captured target set **must not** follow today's external file or present its bytes as historical content.

### Text ranges

- Range reads **must** decode text as UTF-8. Invalid encoding **must** produce an explicit error rather than silently corrupt text.
- Line-range selection **must** recognize both LF and CRLF line endings.
- The reader **must** reject invalid ranges, including zero or negative line numbers and an end before the start.
- If the requested end exceeds the file's length, the reader **must** return through the final line.
- If the requested start is beyond the final line, the reader **must** return an explicit error.
- Whole-file byte reads **must not** depend on text encoding.

### Agent-facing integration

- UIX **must** provide stable system-prompt guidance explaining checkpoint IDs, file-reference syntax, and historical reads.
- Changed checkpoint IDs **must** arrive through a named tag in the existing `<uix-state>` Agent context format.
- Each checkpoint context update **must** contain the checkpoint ID without per-file hashes or repeated instructions.
- The Agent read tool **must** support an optional checkpoint through the shared file reader.
- Built-in edit, write, and Bash tools **must not** trigger automatic checkpoints themselves. Automatic capture **must** use the agreed lifecycle boundaries.

### Session retention and resumption

The session is the retention unit. Agents and branches within a retained session can share checkpoint references. Preserving cross-session references after deletion is outside this scope.

- Closing a connection or stopping an Agent **must not** remove its conversation's worktree, user Git branch, or checkpoint history.
- Resuming a session **must** use its existing working files. UIX **must not** reset those files to the last checkpoint.
- Intervening eligible file changes **must** enter the next pre-run checkpoint.
- UIX **must** retain every referenced checkpoint for as long as its session is retained.
- If a retained session's worktree is missing, UIX **must** fail explicitly rather than silently starting from the primary workspace's current files.

### Explicit session deletion

- The substrate **must** provide a session-deletion operation.
- A session is _active_ while any Agent in it has an active run or any attached client or outstanding operation targets it.
- The backend **must** reject deletion of an active session. Frontend state **must not** replace this backend enforcement.
- Session deletion **must** remove the session's conversation history, all branch worktrees, and ownership of its checkpoints.
- Session deletion **must** remove the session's UIX-created user Git branches, including branches with unmerged work.
- Worktree removal **must** clean up the associated Git worktree administrative metadata, not merely delete working directories.
- Session deletion **must not** modify the primary user Git branch or undo changes already merged into it.
- The session-list UI **must** provide a trash action that invokes the substrate operation.
- The frontend **must** disable the session's trash action while the session is active, in addition to backend enforcement.
- The trash action **must** require destructive confirmation. The confirmation **must** state that deletion discards the session's history and unmerged work.

## Conformance

A conforming implementation demonstrates these outcomes:

1. Bootstrap reuses an existing repository whose worktree root is the workspace, or initializes one at the workspace. For uninitialized history, it creates the initial user Git commit from eligible files with the UIX identity. A nested workspace fails explicitly before any state changes. Remotes, the user's identity configuration, and existing commit-bearing user Git history remain unchanged.
2. A new conversation starts from the primary workspace's HEAD commit even when the source has staged changes, unstaged changes, deletions, and untracked files. Its user Git branch and staging index start at that same commit. Its working files reproduce the committed contents, excluding `.uix` state and with installed dependencies copied separately. Pending source changes are not imported. The provisioned worktree establishes the initial checkpoint baseline. The source worktree's files, staging state, and checked-out branch remain unchanged.
3. Checkpoint capture includes tracked files, tracked-but-ignored files, and untracked non-ignored files. It excludes ignored untracked files and the workspace's `.uix` state. Two successive captures with identical eligible state reuse one checkpoint ID.
4. Copy-on-write provisioning and ordinary copying produce identical file contents and isolation. An edit in one worktree never changes another worktree's files. Git setup does not rewrite cloned files unnecessarily.
5. Pre-run and post-turn captures record changed state at the correct boundaries, including after an interrupted turn. Unchanged state creates no checkpoint, no turn-state entry, and no Agent-context update, and does not clear the branch's recorded checkpoint ID.
6. Compact checkpoint IDs identify immutable file state across session reopen and sibling branches. No ID names two checkpoints or changes its meaning. Identity is durable before announcement, and consumers need no backend revision or storage location.
7. A file reference selects its named checkpoint and optional line range. An unknown checkpoint fails explicitly. The separate-argument read function resolves paths literally, including filenames that conflict with reference syntax.
8. Historical reads return exact recorded bytes without checking out or modifying the worktree. Missing checkpoints or paths fail explicitly. Paths escaping the worktree root fail explicitly. Historical symlinks whose targets are outside the captured set also fail explicitly.
9. Text-range reads apply UTF-8 and LF/CRLF semantics. The reader rejects invalid ranges and clamps an end beyond the file to the final line. It returns an explicit error when the start is beyond the final line.
10. A retained session resumes with its existing working files. The Agent default working directory is the worktree root. Restart does not reset files, and intervening eligible edits enter the next pre-run checkpoint.
11. Session deletion is rejected while the session is active. It removes history, worktrees, checkpoint ownership, and UIX-created user Git branches. It cleans Git administrative metadata and leaves the primary user Git branch unchanged. The UI offers a destructive-confirmation trash action and disables it for active sessions.
12. A source worktree with root and nested `node_modules` installations provisions those directories without a fresh installation. Copy-on-write and ordinary copying both preserve installed contents and internal relative symlinks. Editing copied dependency files does not modify the source installation, and ignored, untracked dependencies remain absent from checkpoints. Resuming the session preserves its own dependency changes.

## Degrees of freedom

A conforming implementation may choose:

- Session storage layout and internal branch-id encoding.
- The checkpoint backend and its object-retention mechanisms.
- Checkpoint ID encoding, allocation, and collision handling.
- Platform-specific copy commands, clone detection, and fallback behavior.
- Internal file-reading and checkpoint-capture mechanisms.

These choices must preserve branch-owned worktrees, user Git history, immutable checkpoints, permanent checkpoint identities, and file-reference behavior.
