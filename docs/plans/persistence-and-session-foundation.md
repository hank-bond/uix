---
summary: "Build spec for persistence on pi's session file: file-backed session + history rehydration (C0) and promoting UIX-core bindings to an in-process pi extension (C1) are the foundation to lay before resuming conversation-render work; versioned content store (C2), per-turn canvas pointers as CustomEntry (C3), anchor-state continuity (C4), and tree preview/restore (C5) are specified here for later. Read before touching session construction, the content-store seam, or conversation-tree navigation."
status: active
---

# Spec: persistence + session foundation (C0–C5)

Persistence is the phase that ties the conversation tree, canvas versions, and anchor state together. Frame and rationale: [session-file-as-state-substrate](../decisions/2026-06-06-session-file-as-state-substrate.md) (pi's session file is the substrate). Versioning mechanics behind the content-store seam: [pane-and-file-versioning](../design/pane-and-file-versioning.md). The conversation-render work this unblocks: [conversation-render-primitives](../design/conversation-render-primitives.md).

**Do first, then context-clear:** **C0 + C1** are the foundation to lay before resuming conversation-render improvements — C0 changes the shape the renderer consumes (replayed complete entries, not just live deltas), and C1 puts that work on the final substrate (the pi `ExtensionAPI`: `sendMessage`/`registerMessageRenderer`/message-transforms) so host-authored blocks can be real session entries from day one. **C2–C5 are deferred** but specified below so nothing is lost.

## Spike answers (resolved 2026-06-06)

- **Write handle.** A pi `ExtensionFactory = (pi: ExtensionAPI) => void` gives the live `ExtensionAPI`: `registerTool`, `appendEntry`, `sendMessage`, `registerMessageRenderer`, `on(...)` hooks. Load in-process with no file discovery: `new DefaultResourceLoader({ cwd, agentDir, extensionFactories: [uixCore] })` → `await loader.reload()` → `createAgentSession({ resourceLoader })`. This is pi's extension system, **not** UIX's frontend one (`src/main/extensions/`, `@uix/api`).
- **Leaf / parent.** `appendEntry(customType, data)` takes no `parentId` — pi auto-attaches to the current leaf. `getLeafId()` / `getLeafEntry()` (on `ReadonlySessionManager`, hence on tool `ctx.sessionManager`) read the current leaf for correlation. Hook choice sets which node a pointer attaches to: `input` (fires before processing → parents to the previous leaf) vs `turn_start`/`turn_end` (within the new turn). Settle in C3.

---

## C0 — File-backed session + history rehydration · _foundation, do first_

**Goal.** The conversation survives restart.

**Build.**

- **Two roots, not one.** A stable **state root** (where `.uix` lives — the canvas content store, and the pi session file via an explicitly pinned `sessionDir`) and the **agent cwd** (what pi's coding tools operate against). Equal today, but kept distinct so a later worktree shift can move the agent cwd without relocating canvases or the session file — see [open-questions](../architecture/open-questions.md) "Reactive agent cwd". Today `src/main/canvas/store.ts` hardcodes `process.cwd()`; formalize both — state root to the canvas store, agent cwd to the session.
- **Resume, not just file-backed.** Swap `SessionManager.inMemory()` (`src/main/agent/driver.ts`) for resume-or-create: continue the most recent session under the state root, creating one only when none exists. File-backing alone would start empty every launch; "survives restart" means resume.
- **Progressive, non-blocking load.** Reading prior history needs only the session file, not auth/model — so the cheap read is eager (off the boot path) and the auth-bearing live agent stays lazy until first prompt. App paint never blocks on session construction; this is also the seam the reactive cwd swaps against (rebuild the lazy tier, leave the eager read and canvas state alone).
- **Startup rehydration.** On startup, read the persisted branch (`getBranch`/`buildSessionContext`) and seed the renderer transcript. The renderer must render **complete historical entries** (full messages; tool calls/results arrive with the render phase) as well as live streaming deltas — a second consumer shape it does not handle today (`src/renderer/Conversation.tsx` only reduces live events).

**Boundary.** No versioning, no custom entries, no extension promotion. Pure pi read + file-backed session. Lands before any render improvement, or the renderers get retrofit when history rehydration arrives.

## C1 — Promote UIX-core bindings to an in-process pi extension · _foundation, do first · = canvas-plan U3_

**Goal.** Hold pi's `ExtensionAPI` — write access to the session tree, hooks, and the message-transform seam.

**Build.**

- Author a **UIX-core pi `ExtensionFactory`**. Move the canvas read/write/edit tools off `createAgentSession({ customTools })` into the factory via `pi.registerTool(...)` (they can technically stay `customTools`, but moving them keeps the API handle and tools together).
- Migrate `contextForTurn` (today a manual prepend in `driver.ts`) to `pi.on("input", ...)` returning `{ action: "transform", text }` — the native submit-boundary hook. The human-writeback diff prepend becomes a transform; the human's original message entry is untouched.
- Wire `DefaultResourceLoader({ extensionFactories: [uixCore] })` into session construction; preserve reload semantics via `resourceLoader.reload()` + `session.reload()`.
- Bridge the `pi` `ExtensionAPI` handle out to the cockpit code that will need `appendEntry`/`sendMessage` (the store/driver), so C3+ can write entries.

**Boundary.** Substrate swap + `contextForTurn` migration only. No new persisted state yet (that is C3+). No user-visible change. Keep `session.subscribe` as the renderer's event source — the `on(...)` hooks are an addition, not a replacement.

## C2 — Versioned content store

**Goal.** Every canvas commit yields a retrievable version id.

**Build.** Evolve `ContentStore` (`src/main/content/content-store.ts`): `commit` returns a version id; add `getVersion(id)` alongside `getCurrent`. Simplest durable impl behind the seam (content-addressed blobs under `.uix`). The git-plumbing owned-pane store ([pane-and-file-versioning](../design/pane-and-file-versioning.md)) slots in later behind the same seam without touching callers.

**Boundary.** Store-only; no session linkage yet.

## C3 — Per-turn state pointers as `CustomEntry`

**Goal.** Each turn records which canvas versions **and which agent cwd** were live; the record rides the tree.

**Build.** At the submit-boundary hook (C1's `input` hook), after committing pending human edits: `pi.appendEntry("uix.turn-state", { panes: { [docId]: versionId }, cwd })` — auto-parented to the leaf. On resume/navigation, walk `parentId` from the node up to the nearest such entry to know which versions were current and which cwd the agent was at; reopen at that cwd (fall back to the home root + notice if the path is gone). Resolves [pane-and-file-versioning](../design/pane-and-file-versioning.md) open-Q #3 and carries the per-turn cwd that [project-root-vs-agent-cwd](../decisions/2026-06-06-project-root-vs-agent-cwd.md) depends on.

**Boundary.** Record + read; restore UI is C5. The agent `changeCwd` capability and standardized worktree creation are their own work, gated on an app needing the move.

## C4 — Anchor-state continuity

**Goal.** Resumed/navigated sessions keep anchor identity, so historical anchors in the transcript still resolve and the edit match-guard works without forcing a re-read.

**Build.** Persist the anchor↔line map + allocation index per doc as a `CustomEntry` (`uix.anchor-state`), or fold it into the C3 entry. **Droppable:** rehydrate on resume; if absent/stale, regenerate from content (consistent but renumbered). This homes the anchor-persistence-sidecar idea inside the session file instead of a loose cache.

**Boundary.** Continuity only.

## C5 — Tree preview + restore

**Goal.** Move around the conversation tree; canvas content and anchor state follow.

**Build.** Read-only **preview** first (select a past node → restore its canvas versions + anchor state into the pane so the human sees it as it was). Then the [pane-and-file-versioning](../design/pane-and-file-versioning.md) rollback action set (conversation-only / pane-only / both), driving `pi.fork` / `pi.navigateTree` (ExtensionCommandContext, available via C1). = canvas-plan U5–U6. The opt-in user-file store (U7) is its own later plan.

**Boundary.** Owned-pane store only.

---

## Reconvene points

- **After C0 + C1:** resume [conversation-render-primitives](../design/conversation-render-primitives.md) (tool-call rendering, the two render registries, the agent-triggered `rich-diff`) on the persisted, extension-backed substrate.
- **C2–C5** are largely independent of the render work and sequenced by dependency above; pick up by appetite.
