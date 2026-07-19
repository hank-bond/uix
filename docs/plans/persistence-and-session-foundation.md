---
summary: "Build spec for persistence on pi's session file: branch projection and feature-isolated restoration now run on startup and replacement-session activation; next, reload commits source state before replacement and restores the reloaded branch before later preview/navigation."
status: active
---

# Spec: persistence + session foundation (C0–C5)

Persistence is the phase that ties the conversation tree, canvas versions, and anchor state together. Frame and rationale: [session-file-as-state-substrate](../decisions/2026-06-06-session-file-as-state-substrate.md) (pi's session file is the substrate). Versioning mechanics behind the document-store seam: [pane-and-file-versioning](../design/pane-and-file-versioning.md). The conversation-render work this unblocks: [conversation-render-primitives](../design/conversation-render-primitives.md).

**Do first, then context-clear:** **C0 + C1** are the foundation to lay before resuming conversation-render improvements — C0 changes the shape the renderer consumes (replayed complete entries, not just live deltas), and C1 puts that work on the final substrate (the pi `ExtensionAPI`: `sendMessage`/`registerMessageRenderer`/message-transforms) so host-authored blocks can be real session entries from day one. **C2–C5 are deferred** but specified below so nothing is lost.

## Spike answers (resolved 2026-06-06)

- **Write handle.** A pi `ExtensionFactory = (pi: ExtensionAPI) => void` gives the live `ExtensionAPI`: `registerTool`, `appendEntry`, `sendMessage`, `registerMessageRenderer`, `on(...)` hooks. Load in-process with no file discovery: `new DefaultResourceLoader({ cwd, agentDir, extensionFactories: [uixCore] })` → `await loader.reload()` → `createAgentSession({ resourceLoader })`. This is pi's extension system, **not** UIX's frontend one (`src/main/extensions/`, `@uix/api`).
- **Leaf / parent.** `appendEntry(customType, data)` takes no `parentId` — pi auto-attaches to the current leaf. `getLeafId()` / `getLeafEntry()` (on `ReadonlySessionManager`, hence on tool `ctx.sessionManager`) read the current leaf for correlation. Hook choice sets which node a pointer attaches to: `input` (fires before processing → parents to the previous leaf) vs `turn_start`/`turn_end` (within the new turn). Settle in C3.

---

## C0 — File-backed session + history rehydration · _foundation, do first_ · **landed**

**Goal.** The conversation survives restart.

**Build.**

- **Two roots, not one.** A stable **state root** (where `.uix` lives — the document store, and the pi session file via an explicitly pinned `sessionDir`) and the **agent cwd** (what pi's coding tools operate against). Equal today, but kept distinct so a later worktree shift can move the agent cwd without relocating canvases or the session file — see [open-questions](../architecture/open-questions.md) "Reactive agent cwd". The local document store is rooted at the UIX state root; keep that distinct from the agent cwd used by pi tools.
- **Resume, not just file-backed.** Swap `SessionManager.inMemory()` (`src/main/agent/driver.ts`) for resume-or-create: continue the most recent session under the state root, creating one only when none exists. File-backing alone would start empty every launch; "survives restart" means resume.
- **Progressive, non-blocking load.** Reading prior history needs only the session file, not auth/model — so the cheap read is eager (off the boot path) and the auth-bearing live agent stays lazy until first prompt. App paint never blocks on session construction; this is also the seam the reactive cwd swaps against (rebuild the lazy tier, leave the eager read and canvas state alone).
- **Startup rehydration.** On startup, read the persisted branch (`getBranch`/`buildSessionContext`) and seed the renderer transcript. _Landed follow-up:_ main now normalizes both complete historical entries (messages plus tool calls/results and displayed custom messages) and live streaming events into one `TranscriptItem` shape; live partials remain in-flight only and are discarded when the final item arrives.

**Boundary.** No versioning, no custom entries, no extension promotion. Pure pi read + file-backed session. Lands before any render improvement, or the renderers get retrofit when history rehydration arrives.

## C1 — Promote UIX-core agent facets to an in-process pi extension · _foundation, do first · = canvas-plan U3_ · **landed 2026-06-07**

**Goal.** Hold pi's `ExtensionAPI` — write access to the session tree, hooks, and the message-transform seam.

**Build.**

- Author a **UIX-core pi `ExtensionFactory`**. Move the canvas read/write/edit tools off `createAgentSession({ customTools })` into the factory via `pi.registerTool(...)` (they can technically stay `customTools`, but moving them keeps the API handle and tools together). _Landed: `createUixCoreExtension` in `src/main/agent/facets.ts` composes an ordered list of `AgentFacet` functions, each handed the live `pi`; the canvas facet (`createCanvasAgentFacet`) registers its read/write/edit tools via `pi.registerTool`._
- Migrate `contextForTurn` (today a manual prepend in `driver.ts`) to `pi.on("input", ...)` returning `{ action: "transform", text }` — the native submit-boundary hook. The human-writeback diff prepend becomes a transform; the human's original message entry is untouched. _Landed: the driver now sends the human's text verbatim and the canvas facet's `input` hook prepends context for the model._ _**Corrected 2026-06-11:** the "entry is untouched" claim was false — pi persists the transformed text as the user entry (dist source: `prompt()` builds the user message from the transform's output), so the prepended context sat inside the human's own message. The `input` transform is gone; turn context currently rides display-hidden custom messages flushed at `before_agent_start`, and the target C3 path moves them into pre-user submit prep — see [agent-state-messages](../design/agent-state-messages.md) and the C3 notes below._
- Wire `DefaultResourceLoader({ extensionFactories: [uixCore] })` into session construction; preserve reload semantics via `resourceLoader.reload()` + `session.reload()`. _Landed in `driver.ts` `openSession()`. **Deviation:** `session.reload()` already reloads the resource loader internally (`agent-session.js`), so the cockpit `reload()` was left calling `session.reload()` alone — no separate `resourceLoader.reload()` needed._
- Bridge the `pi` `ExtensionAPI` handle out to the cockpit code that will need `appendEntry`/`sendMessage` (the store/driver), so C3+ can write entries. _**Deferred until the first real consumer.** Exposing the handle now would be a consumer-less accessor (dead code against the repo's "build the contract, not speculation" ethos); the factory captures it the moment the first `uix.*` entry write needs it — [durable-transcript-identity](./durable-transcript-identity.md) D2's block state or C3's `uix.turn-state`, whichever lands first._

**Boundary.** Substrate swap + `contextForTurn` migration only. No new persisted state yet (that is C3+). No user-visible change. Keep `session.subscribe` as the renderer's event source — the `on(...)` hooks are an addition, not a replacement.

> **Scope note.** This landed as the composition-root structure, not just a narrow swap: `createUixCoreExtension` runs an ordered list of per-subsection `AgentFacet` functions, each handed the live `pi`. Order is load-bearing because pi has no priority field — rationale in decision [uix-core-composition-root](../decisions/2026-06-07-uix-core-composition-root.md) and design thread [uix-core-composition](../design/uix-core-composition.md). Read those before adding a _second_ facet.

## C2 — Versioned content store · **first JSON-object store landed 2026-06-17**

**Goal.** The canvas has a mutable latest working copy plus immutable snapshots; a snapshot restores the editor whole — content **and** anchor state together.

**Build.** Evolve `DocumentStore` (`src/main/documents/store.ts`) into two concepts behind one seam: `getCurrent` / `setCurrent` keep the latest mutable document bytes current on every iframe writeback or agent tool write, while `createSnapshot(meta)` returns a version id and `getVersion(id)` restores an immutable version. A version is **commit-like, not a bare blob**: `{ contentRef, meta: { anchorMap, allocIndex } }` — content blobs stay content-addressed and deduped underneath; the version id names the commit object, **not** the content hash, because two identical contents can carry different anchor states. Anchor state rides the version because it is a function of the document's edit history up to that commit; restoring a version is therefore atomic and necessarily consistent (see revised C4). Simplest durable impl behind the seam (objects under `.uix`); the git-plumbing owned-pane store ([pane-and-file-versioning](../design/pane-and-file-versioning.md)) slots in later behind the same seam — conveniently the same commit-object shape — and diff/delta compression is explicitly an optimization deferred to that store (packfiles), never a semantic. If git mechanics require object creation on every writeback, those versions are ephemeral until a session `CustomEntry` points at them; only referenced snapshots are branch state.

_Landed store:_ `DocumentStore` now has `getCurrent` / `setCurrent` / `createSnapshot` / `getVersion`; the local implementation stores current bytes and immutable JSON versions under `.uix/documents/`; `CanvasDocumentBuffer.createSnapshots()` (renamed from `DocumentChannel`/`DocumentBuffer` — it is the canvas feature's purpose-owned working copy over the store, not a transport or universal document abstraction) canonicalizes mutable latest and stores exact `AnchoredDocument` lines plus `nextAnchorIndex` as version meta; the overloaded `AnchoredDocument` constructor restores that state. The git-backed owned-pane store is still a later implementation behind the same seam, and its diff/delta compression is an optimization, not a semantic — the id-addressed `meta`-opaque seam keeps it deferrable.

**Boundary.** Store-only; session linkage starts in C3.

## C3 — Submit-boundary entries: turn-state pointers and human canvas diff

**Goal.** Each turn records which document snapshots **and which agent cwd** were live, and the human's pending canvas edits reach the agent as a durable non-user message — both as entries riding the tree, prepared at one boundary and ordered before the user message.

**Build.** In UIX submit prep, before calling `session.prompt(text)`, after the latest canvas writebacks have updated current content and after any user-text-dependent context/reminder prep finishes, append in order:

- **`uix.turn-state` pointer:** the turn-state coordinator appends `pi.appendEntry("uix.turn-state", { cwd, state: { [featureId]: <opaque> } })`; the canvas feature's state is `{ "doc://canvas/main": snapshotId }`, but the coordinator never interprets it (see [pane-and-file-versioning](../design/pane-and-file-versioning.md) Log 2026-06-21 for the contribution-keyed/opaque-state model that supersedes the old flat `panes` shape). On resume/navigation, the nearest such entry up the branch says which snapshots were current and which cwd the agent was at; reopen at that cwd (fall back to the home root + notice if the path is gone). Restore granularity is **run boundaries** — matching pi CLI's model — which is why pointers are per-boundary even though the latest file changes continuously. Resolves [pane-and-file-versioning](../design/pane-and-file-versioning.md) open-Q #3 and carries the per-turn cwd (substrate-owned, since the store is path-unaware) that [project-root-vs-agent-cwd](../decisions/2026-06-06-project-root-vs-agent-cwd.md) depends on.
- **`uix.state` / `<canvas.canvas-diff>` as a `CustomMessageEntry`** — derive the anchored human-diff from the nearest upstream `uix.turn-state` snapshot to the new submit snapshot; `content` is the `<uix-state>` envelope with `<canvas.canvas-diff>` and any other state sections, `details` is the structured sidecar for rich/debug rendering, and `display` controls the human-facing strip. Appended **before** the user message lands, so tree navigation to the gap before a user message still has the hidden state needed to hydrate that point, and the stored user entry stays exactly what the human typed. _**Current implementation note:** the derivation has landed in the agent-context substrate (`src/main/agent-context/`): materializers run after turn-state prep, read their own feature's latest/prior `uix.turn-state` refs, and canvas computes anchored hunks from persisted snapshot meta. The delivery seam is still transitional: the hidden message is flushed from `before_agent_start`, which pi orders after the user message. The desired submit-prep path still appends the custom message before `session.prompt(text)`._ At `agent_end`, create snapshots of loaded canvas working documents and commit changed cells in `uix.turn-state`. The next user-submit diff then uses that post-agent snapshot as the nearest upstream baseline, because the agent already observed those changes through tool results. Canvas does not separately report which document is visible: document updates are keyed by document resource id, and future surface interactions will carry surface-instance identity. The hidden `uix.state` message still flushes through the transitional `before_agent_start` assembler, so ordering that custom message before the user entry remains open.

_Update 2026-06-21:_ the submit/agent-end appending moved out of the canvas facet into the substrate-level turn-state registry/coordinator (`src/main/turn-state/`). _Update 2026-06-30:_ the consuming `consumeChanges()` path is gone. Canvas turn state stores only branded `doc://canvas/...` resource ids mapped to snapshot ids; agent context derives `<canvas.canvas-diff>` from the current/prior snapshot refs at materialization time. _Update 2026-07-18:_ the old singleton contribution became keyed schema/snapshot/restore cells. Canvas now contributes `canvas.documents`; the coordinator validates snapshots and independently suppresses unchanged complete cell values, and its restore callback resolves content plus anchor metadata or resets defaults. Shared branch projection, feature-isolated restore scheduling, startup activation, and replacement-session activation have landed; reload save/replay remains C5. In parallel, the canvas path is being reframed as a default feature: it will contribute `canvas` state, a canvas document kind, exact source ids such as `canvas.pane.writeback` / `canvas.agent.anchor_edit`, and listeners that decide refresh vs agent-visible diffing from those source ids.

Both entry types rehydrate through the one branch-walk projection ([durable-transcript-identity](./durable-transcript-identity.md) D3); each entry's projector lives beside the facet that writes it.

**Boundary.** Record + read; restore UI is C5. The agent `changeCwd` capability and standardized worktree creation are their own work, gated on an app needing the move.

## C4 — Anchor rehydration from version meta

**Goal.** Resumed/navigated sessions keep anchor identity, so historical anchors in the transcript still resolve and the edit match-guard works without forcing a re-read.

**Build.** Anchor state (anchor↔line map + allocation index) is **stored in the version's commit meta (C2), not as a session entry** — it is a function of the document's edit history up to that commit, so checkout restores content and anchors as one atomic, necessarily-consistent unit; the C3 turn-state pointer alone stitches turn → version → `{content, anchors}`. C4 reduces to the rehydration wiring: on resume/branch navigation, seed the reconciler from the checked-out version's meta. This supersedes both the earlier `uix.anchor-state` entry idea and the loose sidecar cache. **This is no longer a separate unit — it _is_ the canvas contribution's restore hook** (C5): resolving `getVersion` hands back content + anchor meta together, so anchor rehydration is just what restore does for canvas.

**Droppability is the safety story, not the mechanism.** If meta is missing/stale, regenerate from content — consistent but **renumbered**, which dangles every anchor quoted in historical tool results; the edit match-guard then rejects rather than corrupts and the agent re-reads. That re-read dumps the document (or requested section) back into context — the cost that makes anchor continuity worth engineering and the guard a last resort.

**Boundary.** Continuity only.

## C5 — Tree preview + restore

**Goal.** Move around the conversation tree; canvas content and anchor state follow.

**Build.** This is the **activation/navigation half of the symmetric state-cell contract** settled further in [session history and switching](./session-history-and-switching.md): a feature contributes one or more named cells, and each cell owns a reason-free `createSnapshot()` plus `restore(latest | undefined)` together. The coordinator derives cell identity, persists only complete cell values that changed, derives each active cell's latest value in the selected-branch projection, and routes it back to that cell; it remains store-blind while the cell resolves/applies its payload. Startup and replacement-session rebind now provide restore triggers; reload wiring remains next. Future read-only preview may remain a discrete callback because selecting a historical node should be able to show state transiently without committing a rollback. The same cell that creates Canvas document-ref snapshots restores content plus anchor metadata, so C4 lands inside Canvas restore rather than as a second session entry.

Activation **restore** now runs on startup and replacement-session rebind, including Canvas content plus anchor metadata (this is where C4 lands); reload joins the same path after source-save ordering is wired. Later read-only preview can select a past node and resolve its versions into the pane without changing the active branch. The later [pane-and-file-versioning](../design/pane-and-file-versioning.md) rollback action set (conversation-only / pane-only / both) drives `pi.fork` / `pi.navigateTree` (ExtensionCommandContext, available via C1); selective rollback remains future design over named state cells. = canvas-plan U5–U6. The opt-in user-file store (U7) is its own later plan.

**Boundary.** Owned-pane store only.

---

## Near-term implementation direction

1. Move the `uix.state` delivery seam out of transitional `before_agent_start` flushing and into submit prep before `session.prompt(text)`, after `uix.turn-state` prep appends.
2. Commit source state before reload, then invoke the selected-branch projection and restore scheduler after feature/Pi reload; add preview only with the later navigation UI.
3. Introduce the document-engine transaction/event shape for managed documents only when a second concrete writer/listener needs it: document kind normalization, exact `sourceId`, and ref-only write events `{ resourceId, kindId, sourceId, beforeSnapshotId, afterSnapshotId, normalized }`.
4. Move canvas wiring toward a first-party default feature boundary: canvas kind, surface writeback handler, agent anchor tools, turn-state contribution, and source-aware listeners live together.
5. Route canvas surface writeback and canvas agent tools through the same document engine once that engine exists; fold normalization into agent tool results so the model sees final canonical anchored output.

## Reconvene points

- **After C0 + C1:** resume [conversation-render-primitives](../design/conversation-render-primitives.md) (tool-call rendering, the two render registries, the agent-triggered `rich-diff`) on the persisted, extension-backed substrate.
- **C2–C5** are largely independent of the render work and sequenced by dependency above; pick up by appetite.
