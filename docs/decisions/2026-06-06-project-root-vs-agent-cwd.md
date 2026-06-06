---
summary: "Two separate locations: the UIX project root (stable per app instance — holds the pi/uix session history and the canvas doc store) and the agent cwd (where the agent happens to be working, free to change turn to turn). Not scoped to worktrees — the agent cwd is a free pointer to any path (IDE model). cwd changes are agent-initiated, recorded per turn, and reopen the same history under a new cwd; they are NOT history branches. Read before touching session construction, cwd handling, or the per-turn state entry (C3)."
status: accepted
---

# The UIX project root and the agent cwd are separate

Two locations, deliberately decoupled:

- **UIX project root** (`stateRoot`) — where the app instance lives: the pi/uix session history and the canvas document store (`.uix/sessions`, `.uix/canvas`). **Fixed for the life of an app instance.** Switching to a different project means a different root — a different conversation and canvas set, i.e. new history. This is "where the UIX project is."
- **Agent cwd** (`agentCwd`) — where the agent happens to be working: what pi's coding tools (bash/read/edit/grep) operate against. **Free to change turn to turn.** This is "where the agent is."

**Not scoped to worktrees.** A worktree is just one case of "agent cwd ≠ project root." The agent cwd is a free pointer to _any_ path — a worktree, a sibling repo under the project, an arbitrary folder. The mental model is an IDE: the IDE workspace (the `.uix` project — conversation, canvases, sessions) is persistent and stable; "open folder" (the agent cwd) points wherever you want and moves freely, while the conversation narrates across all of it from the stable root. The canvas/conversation is a discrete sidecar communicated over the wire, independent of where the agent works.

## How a cwd change works

- **Agent-initiated, as a turn.** Most cwd changes come from the agent's own workflow (e.g. "work in a worktree for this task") — a capability that _is_ a turn, not a side channel. A human-facing UI control may come later; the per-turn record (below) handles either initiator since it is captured at the turn boundary. cwd is agent _operating context_ (like `cd`), not a UI handle, so this stays inside [no-agent-ui-manipulation](./2026-05-30-no-agent-ui-manipulation.md).
- **Reopen the same history, do not branch.** Pi binds cwd at session creation, but `SessionManager.open(file, sessionDir, cwdOverride)` re-opens the _same_ session file under a different cwd (the header cwd stays the home/root; the override is runtime-only). In the cockpit this rebuilds the two in-memory tiers — the `SessionManager` and the live `AgentSession` (see [persistence-and-session-foundation](../plans/persistence-and-session-foundation.md) C0's two-tier load) — against the unchanged file. **Same conversation tree, same leaf, full prior context.** The persisted history is untouched; only where the agent's tools point changes.
- **`forkFrom` is not used for cwd.** History branching is a discrete action on its own axis (tree navigation / throwaway alternatives, C5) that _may or may not_ coincide with a cwd change depending on impetus. You never branch _in order to_ move cwd. A branch can carry its own cwd; that composition falls out for free.

## How cwd survives resume

Because the override is runtime-only, the agent cwd must be **recorded per turn** to be durable — folded into the C3 per-turn `CustomEntry` alongside canvas version pointers (zero token cost, parent-linked into the tree). Resume rule: go to the last leaf, reopen at _that leaf's_ recorded cwd. If the path no longer exists (e.g. a deleted worktree), fall back to the home root and surface a notice. UIX should **standardize worktree creation** (a known location, not `/tmp`) so resume-to-worktree is reliable rather than landing on a vanished directory. The active cwd is shown in a footer at the bottom of the chat.

## Why this over conflating them

A single root would force the canvas store and session file to move with the agent — orphaning the conversation's state every time the agent stepped into a worktree. Keeping the project root stable while the agent roams is what lets the sidecar model hold: state is _about_ whatever the agent is working on but _lives_ at the project root. It stays [hosting-compatible](./2026-05-31-hosting-compatible-by-default.md) (state behind the store seam, a portable artifact) and keeps the project/cwd line crisp — switch project = new history; switch cwd = same history, recorded per turn.

## Status

The model is decided. Implementation is deferred and lands across the persistence phase: the C0 `stateRoot`/`agentCwd` split is in the code now; per-turn cwd rides C3; the agent `changeCwd` capability, resume-to-leaf-cwd logic, the footer, and standardized worktree creation are built when an app concretely needs the move. Supersedes the "Reactive agent cwd" entry in [open-questions](../architecture/open-questions.md).
