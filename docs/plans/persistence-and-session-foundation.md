---
summary: "Build spec for persistence on pi's session file: file-backed session + history rehydration (C0), the in-process pi extension (C1), and C3's canvas-diff + change-only pane-visibility messages (landed early via the state-message substrate) are done; versioned content store with anchor state in commit meta (C2), the C3 turn-state pointer, anchor rehydration from version meta (C4), and tree preview/restore (C5) are specified for later."
status: active
---

# Spec: persistence + session foundation (C0–C5)

Persistence is the phase that ties the conversation tree, canvas versions, and anchor state together. Frame and rationale: [session-file-as-state-substrate](../decisions/2026-06-06-session-file-as-state-substrate.md) (pi's session file is the substrate). Versioning mechanics behind the content-store seam: [pane-and-file-versioning](../design/pane-and-file-versioning.md). The conversation-render work this unblocks: [conversation-render-primitives](../design/conversation-render-primitives.md).

**Do first, then context-clear:** **C0 + C1** are the foundation to lay before resuming conversation-render improvements — C0 changes the shape the renderer consumes (replayed complete entries, not just live deltas), and C1 puts that work on the final substrate (the pi `ExtensionAPI`: `sendMessage`/`registerMessageRenderer`/message-transforms) so host-authored blocks can be real session entries from day one. **C2–C5 are deferred** but specified below so nothing is lost.

## Spike answers (resolved 2026-06-06)

- **Write handle.** A pi `ExtensionFactory = (pi: ExtensionAPI) => void` gives the live `ExtensionAPI`: `registerTool`, `appendEntry`, `sendMessage`, `registerMessageRenderer`, `on(...)` hooks. Load in-process with no file discovery: `new DefaultResourceLoader({ cwd, agentDir, extensionFactories: [uixCore] })` → `await loader.reload()` → `createAgentSession({ resourceLoader })`. This is pi's extension system, **not** UIX's frontend one (`src/main/extensions/`, `@uix/api`).
- **Leaf / parent.** `appendEntry(customType, data)` takes no `parentId` — pi auto-attaches to the current leaf. `getLeafId()` / `getLeafEntry()` (on `ReadonlySessionManager`, hence on tool `ctx.sessionManager`) read the current leaf for correlation. Hook choice sets which node a pointer attaches to: `input` (fires before processing → parents to the previous leaf) vs `turn_start`/`turn_end` (within the new turn). Settle in C3.

---

## C0 — File-backed session + history rehydration · _foundation, do first_ · **landed**

**Goal.** The conversation survives restart.

**Build.**

- **Two roots, not one.** A stable **state root** (where `.uix` lives — the canvas content store, and the pi session file via an explicitly pinned `sessionDir`) and the **agent cwd** (what pi's coding tools operate against). Equal today, but kept distinct so a later worktree shift can move the agent cwd without relocating canvases or the session file — see [open-questions](../architecture/open-questions.md) "Reactive agent cwd". Today `src/main/canvas/store.ts` hardcodes `process.cwd()`; formalize both — state root to the canvas store, agent cwd to the session.
- **Resume, not just file-backed.** Swap `SessionManager.inMemory()` (`src/main/agent/driver.ts`) for resume-or-create: continue the most recent session under the state root, creating one only when none exists. File-backing alone would start empty every launch; "survives restart" means resume.
- **Progressive, non-blocking load.** Reading prior history needs only the session file, not auth/model — so the cheap read is eager (off the boot path) and the auth-bearing live agent stays lazy until first prompt. App paint never blocks on session construction; this is also the seam the reactive cwd swaps against (rebuild the lazy tier, leave the eager read and canvas state alone).
- **Startup rehydration.** On startup, read the persisted branch (`getBranch`/`buildSessionContext`) and seed the renderer transcript. _Landed follow-up:_ main now normalizes both complete historical entries (messages plus tool calls/results and displayed custom messages) and live streaming events into one `TranscriptItem` shape; live partials remain in-flight only and are discarded when the final item arrives.

**Boundary.** No versioning, no custom entries, no extension promotion. Pure pi read + file-backed session. Lands before any render improvement, or the renderers get retrofit when history rehydration arrives.

## C1 — Promote UIX-core bindings to an in-process pi extension · _foundation, do first · = canvas-plan U3_ · **landed 2026-06-07**

**Goal.** Hold pi's `ExtensionAPI` — write access to the session tree, hooks, and the message-transform seam.

**Build.**

- Author a **UIX-core pi `ExtensionFactory`**. Move the canvas read/write/edit tools off `createAgentSession({ customTools })` into the factory via `pi.registerTool(...)` (they can technically stay `customTools`, but moving them keeps the API handle and tools together). _Landed: `createUixCoreExtension` in `src/main/agent/bindings.ts` composes an ordered list of `AgentBinding` functions, each handed the live `pi`; the canvas binding (`createCanvasAgentBinding`) registers its read/write/edit tools via `pi.registerTool`._
- Migrate `contextForTurn` (today a manual prepend in `driver.ts`) to `pi.on("input", ...)` returning `{ action: "transform", text }` — the native submit-boundary hook. The human-writeback diff prepend becomes a transform; the human's original message entry is untouched. _Landed: the driver now sends the human's text verbatim and the canvas binding's `input` hook prepends context for the model._ _**Corrected 2026-06-11:** the "entry is untouched" claim was false — pi persists the transformed text as the user entry (dist source: `prompt()` builds the user message from the transform's output), so the prepended context sat inside the human's own message. The `input` transform is gone; turn context now rides display-hidden custom messages flushed at `before_agent_start` — see [agent-state-messages](../design/agent-state-messages.md) and the C3 landing notes below._
- Wire `DefaultResourceLoader({ extensionFactories: [uixCore] })` into session construction; preserve reload semantics via `resourceLoader.reload()` + `session.reload()`. _Landed in `driver.ts` `openSession()`. **Deviation:** `session.reload()` already reloads the resource loader internally (`agent-session.js`), so the cockpit `reload()` was left calling `session.reload()` alone — no separate `resourceLoader.reload()` needed._
- Bridge the `pi` `ExtensionAPI` handle out to the cockpit code that will need `appendEntry`/`sendMessage` (the store/driver), so C3+ can write entries. _**Deferred until the first real consumer.** Exposing the handle now would be a consumer-less accessor (dead code against the repo's "build the contract, not speculation" ethos); the factory captures it the moment the first `uix.*` entry write needs it — [durable-transcript-identity](./durable-transcript-identity.md) D2's block state or C3's `uix.turn-state`, whichever lands first._

**Boundary.** Substrate swap + `contextForTurn` migration only. No new persisted state yet (that is C3+). No user-visible change. Keep `session.subscribe` as the renderer's event source — the `on(...)` hooks are an addition, not a replacement.

> **Scope note.** This landed as the composition-root structure, not just a narrow swap: `createUixCoreExtension` runs an ordered list of per-subsection `AgentBinding` functions, each handed the live `pi`. Order is load-bearing because pi has no priority field — rationale in decision [uix-core-composition-root](../decisions/2026-06-07-uix-core-composition-root.md) and design thread [uix-core-composition](../design/uix-core-composition.md). Read those before adding a _second_ binding.

## C2 — Versioned content store

**Goal.** Every canvas commit yields a retrievable version id, and a version restores the editor whole — content **and** anchor state together.

**Build.** Evolve `ContentStore` (`src/main/content/content-store.ts`): `commit` returns a version id; add `getVersion(id)` alongside `getCurrent`. A version is **commit-like, not a bare blob**: `{ contentRef, meta: { anchorMap, allocIndex } }` — content blobs stay content-addressed and deduped underneath; the version id names the commit object, **not** the content hash, because two identical contents can carry different anchor states. Anchor state rides the version because it is a function of the document's edit history up to that commit; restoring a version is therefore atomic and necessarily consistent (see revised C4). Simplest durable impl behind the seam (objects under `.uix`); the git-plumbing owned-pane store ([pane-and-file-versioning](../design/pane-and-file-versioning.md)) slots in later behind the same seam — conveniently the same commit-object shape — and diff/delta compression is explicitly an optimization deferred to that store (packfiles), never a semantic.

**Boundary.** Store-only; no session linkage yet.

## C3 — Submit-boundary entries: turn-state pointers, human canvas diff, pane visibility

**Goal.** Each turn records which canvas versions **and which agent cwd** were live; the human's pending canvas edits reach the agent as a durable non-user message; the agent knows which panes the human is looking at — all as entries riding the tree, written at one boundary.

**Build.** At the submit-boundary hook (C1's `input` hook), after committing pending human edits, in order:

- **`uix.canvas-diff` as a `CustomMessageEntry`** — the anchored human-diff, today an ephemeral `input`-hook text transform, becomes a durable custom message the agent sees as its own non-user message: `content` = the anchored diff block, `details` = structured hunks for a rich chat block, `display` controls the human-facing "you changed these lines" rendering. Appended **before** the user message lands, so context order reads diff-then-question, and the stored user entry stays exactly what the human typed. The `collectChanges()` consuming-read landmine still applies ([canvas-data-channel](../design/canvas-data-channel.md) log 2026-06-06): this is the single consuming read; pending-diff UI peeks non-mutatingly. _**Landed early 2026-06-11**, mechanism amended: flushed through the state-message substrate (`src/main/agent/state-messages.ts`, an `atTurnBoundary` consuming-read registration) as a `before_agent_start` message — which lands **after** the user message in context, an accepted deviation from the diff-then-question ordering; `display: false` for now, the rich human-facing chat block is still open. See [agent-state-messages](../design/agent-state-messages.md)._
- **`uix.pane-visibility`, change-only.** The renderer emits visibility signals ephemerally; main latches current visibility in RAM and, at this boundary, appends a small `CustomMessageEntry` **only when it differs from the last persisted visibility on this branch** — so the agent knows what the human is probably talking about, without repeating an unchanged fact every message. The latch is re-seeded from the branch walk after navigation (D3 rehydrator, nearest-wins) so changes are neither suppressed nor duplicated. _**Landed early 2026-06-11**, mechanism amended: a change-only state-message registration whose flush compares against the nearest persisted entry **up the branch directly** — the branch is the latch, so no RAM re-seeding and no D3 dependency. Payload is `{"canvases_open": [...]}`, explained once by the assembled system-prompt vocabulary section._
- **`uix.turn-state` pointer:** `pi.appendEntry("uix.turn-state", { panes: { [docId]: versionId }, cwd })` — auto-parented to the leaf. On resume/navigation, the nearest such entry up the branch says which versions were current and which cwd the agent was at; reopen at that cwd (fall back to the home root + notice if the path is gone). Restore granularity is **turn boundaries** — matching pi CLI's model — which is why pointers are per-turn even though the store versions every modification. Resolves [pane-and-file-versioning](../design/pane-and-file-versioning.md) open-Q #3 and carries the per-turn cwd that [project-root-vs-agent-cwd](../decisions/2026-06-06-project-root-vs-agent-cwd.md) depends on.

All three rehydrate through the one branch-walk rehydrator ([durable-transcript-identity](./durable-transcript-identity.md) D3); each entry's reducer registers beside the binding that writes it.

**Boundary.** Record + read; restore UI is C5. The agent `changeCwd` capability and standardized worktree creation are their own work, gated on an app needing the move.

## C4 — Anchor rehydration from version meta

**Goal.** Resumed/navigated sessions keep anchor identity, so historical anchors in the transcript still resolve and the edit match-guard works without forcing a re-read.

**Build.** Anchor state (anchor↔line map + allocation index) is **stored in the version's commit meta (C2), not as a session entry** — it is a function of the document's edit history up to that commit, so checkout restores content and anchors as one atomic, necessarily-consistent unit; the C3 turn-state pointer alone stitches turn → version → `{content, anchors}`. C4 reduces to the rehydration wiring: on resume/branch navigation, seed the reconciler from the checked-out version's meta. This supersedes both the earlier `uix.anchor-state` entry idea and the loose sidecar cache.

**Droppability is the safety story, not the mechanism.** If meta is missing/stale, regenerate from content — consistent but **renumbered**, which dangles every anchor quoted in historical tool results; the edit match-guard then rejects rather than corrupts and the agent re-reads. That re-read dumps the document (or requested section) back into context — the cost that makes anchor continuity worth engineering and the guard a last resort.

**Boundary.** Continuity only.

## C5 — Tree preview + restore

**Goal.** Move around the conversation tree; canvas content and anchor state follow.

**Build.** Read-only **preview** first (select a past node → restore its canvas versions + anchor state into the pane so the human sees it as it was). Then the [pane-and-file-versioning](../design/pane-and-file-versioning.md) rollback action set (conversation-only / pane-only / both), driving `pi.fork` / `pi.navigateTree` (ExtensionCommandContext, available via C1). = canvas-plan U5–U6. The opt-in user-file store (U7) is its own later plan.

**Boundary.** Owned-pane store only.

---

## Reconvene points

- **After C0 + C1:** resume [conversation-render-primitives](../design/conversation-render-primitives.md) (tool-call rendering, the two render registries, the agent-triggered `rich-diff`) on the persisted, extension-backed substrate.
- **C2–C5** are largely independent of the render work and sequenced by dependency above; pick up by appetite.
