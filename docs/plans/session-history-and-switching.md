---
summary: "Stage durable session history so transition foundations unlock New Session first, then switching and naming, while robustness, diagnostics, recovery, and polish follow without blocking those vertical slices."
status: active
---

# Session history, naming, and switching

## Status

This plan records the settled target behavior and orders delivery by usable value. The core path reaches New Session and then session switching before defensive hardening and UX polish. Each unit receives its file-level implementation detail only when promoted for review; later robustness work must not hold earlier vertical slices hostage.

## Settled model

- One Pi session JSONL file is one durable conversation history graph.
- Pi's `AgentSession` is the ephemeral runtime attached to the selected graph; it is not the durable session identity.
- Creating a session creates a new graph, not a branch inside the old graph.
- Intra-session branch rewind/navigation is not built in this workstream, but session loading and replay must be shaped so it can use the same lifecycle later.
- Session files remain under the stable workspace state root and are addressed by durable session id across renderer/main boundaries; local file paths stay private.

## Settled naming and labels

Pi's native append-only `session_info` entries own the explicit display name. Renaming appends another entry; the latest entry in file order wins; an empty value clears the name. The name is graph-wide metadata, not branch-local state, model context, or a Chat block.

The displayed label is derived in this order:

1. explicit session name;
2. first user message, whitespace-collapsed and truncated;
3. `New conversation` before any message.

The fallback label is not written as an automatic name node. Clearing an explicit name reveals the fallback again.

## Settled recent-summary loading

The workspace file is living workspace state and may persist the currently selected session plus a cached display label for fast initial presentation. The session JSONL remains authoritative; the cached label is a rebuildable projection.

Recent-session discovery stays off the initial-render path. After the initial surface state renders, Chat can request the active transcript and the recent ten sessions independently; whichever response arrives first updates its own state. Search, additional pages, and non-active transcript reads remain on demand.

For the local recent-summary implementation, order files newest-first by filesystem modification time, select the requested limit, then process those files sequentially. Rename and standalone turn-state commits count as activity and may move a session upward. At the expected 5–10 MB large-session size, load one whole file as a `Buffer`, byte-search for candidate `session_info` records, and parse only matching records plus the small amount of header/first-message data needed for the label. Avoid Pi's current list path that parses every JSONL entry. Reverse paging, a persistent index, and streamed batches wait for profiling evidence.

The initial session-summary shape is deliberately small:

```ts
interface SessionSummary {
  sessionId: string;
  displayName?: string;
  displayLabel: string;
  createdAt: string;
  modifiedAt: string;
}
```

`displayName` is the latest explicit `session_info` name. `displayLabel` is computed by the substrate from explicit name → first user message → `New conversation`; it is not an automatically persisted name node. The workspace may cache the active label for fast presentation, then reconcile it with the computed authoritative summary. Token, cache-hit, cost, message-count, and similar statistics are not part of the initial row.

`list_session_summaries({ limit })` returns recent summaries newest-first and serves the dropdown/sidebar projection; `limit: 1` is the lightweight newest-session query. There is no singular `session_summary` or ambient `current_session` request. `session_history({ sessionId? })` is the transcript read: omitted id reads the selected session, while an explicit id reads another session without activating it. Its response carries the resolved `SessionSummary` so stale results can be rejected. `new_session(void)` always creates an unnamed fresh graph; naming is separate. `switch_session({ sessionId })` activates the selected graph and returns its `SessionSummary`. `set_session_name({ sessionId, displayName })` targets any session, uses `string` for an explicit name and `null` to clear it, and returns the updated `SessionSummary`. Explicit names trim surrounding whitespace, reject a blank string (`null` clears), preserve internal spaces, and have a 100-character maximum. New/switch/name/history responses provide a directly involved session's summary without another request.

V1 does not broadcast a separate session-change event. New, switch, and selector entry points all go through one workspace session controller. A successful backend request returns only after commit/switch/restore completes; the controller then replaces shared renderer active-session state from that response. Chat observes the active session id, clears stale presentation, and loads that session's history. Feature bags stay mounted during a session switch; backend state cells have already been restored before the response. A broadcast becomes necessary only if session changes later gain an independent source or multiple renderer clients.

Async renderer projections use state-owner-local latest-request guards rather than backend request ids. A React effect uses its cleanup flag; loads triggered outside an effect use a monotonic load version. Starting a history load captures that guard and its target session id; the response applies only if its request is still latest and that session is still active. This also rejects an old A response after an A → B → A sequence. The recent-summary projection has an independent guard, invalidated by a newer list load or a completed session mutation. These guards are in-memory renderer coordination only; they are not transmitted or persisted.

## Settled turn-state contribution shape

A feature may contribute multiple named turn-state cells as a keyed object. Each cell owns one independently changing durable value and contributes both directions together:

```ts
turnState: {
  documents: {
    schema: DocumentStateSchema,
    createSnapshot: () => completeDocumentState,
    restore: (state) => { /* replace live document state */ },
  },
  selection: {
    schema: SelectionStateSchema,
    createSnapshot: () => completeSelectionState,
    restore: (state) => { /* replace live selection state */ },
  },
}
```

The substrate derives each persisted identity from the owning feature plus keyed path, such as `canvas.documents` and `canvas.selection`; authors never supply canonical ids. `createSnapshot()` is reason-free: the coordinator decides when a durable commit occurs, while the cell always answers with its complete current value. `restore(latest | undefined)` receives only the latest reconstructed value for that cell; `undefined` means initialize/reset defaults. Event histories belong in event entries, not turn state.

Each cell's required TypeBox schema is the single data contract for both directions. A definition helper carries `Static<typeof schema>` into `createSnapshot()`'s return type and `restore()`'s parameter at compile time. At runtime, the substrate validates each snapshot before committing it as JSON; branch projection retains latest cell values as `unknown`, validates each active cell's value once after reaching the leaf, and only then calls its typed restore adapter. State is plain JSON: no custom serializers, classes, or TypeBox transform codecs in this contract.

At every commit boundary the coordinator asks each active cell for a snapshot, validates its complete value, structurally compares that whole cell value with its nearest committed value, and appends only changed cells to the combined `uix.turn-state` node. Nested values are atomic—there is no recursive diff. A removed/unregistered cell is ignored during restoration, so no deletion tombstone is needed; resetting an active cell uses an explicit default/empty value. Reusing the same cell identity later reconnects to its prior history.

This replaces the prior singleton-per-feature turn-state shape. Independently changing components/subdomains use separate top-level cells so substrate equality and persistence stay flat; feature authors never implement patches, history folds, equality suppression, or serde.

A stable cell id is also a persisted schema commitment across the conversation tree. The current schema must accept historical values reachable under that id. When a nested field is no longer produced in the same conversation, keeping that field optional lets both historical values containing it and new values omitting it validate. Removing the entire named cell makes its old entries dormant and ignored; contributing the same identity again reconnects to them. Type-changing schema evolution beyond those settled cases remains open.

## Settled transition semantics: save source, then replay target

Session switching, reload, and future branch rewind share one state transition lifecycle. If a new/switch/reload request reaches the substrate during an active agent run, the substrate aborts that run and waits for it to settle before committing current turn state and continuing the transition. New Session and Reload are substrate-provided workspace actions, so their invokable action guards can read the workspace's current agent state regardless of whether Chat is installed. A busy guard skips the backend request and produces a transient notice. Abort-and-reload is the explicit simple v1 policy for direct backend callers; keep it visible as a policy that may change when a concrete queued or graceful reload workflow is designed.

### 1. Commit the source state

Before leaving the current branch—or before disposing its feature/Pi bags during reload—create current cell snapshots and commit an ordinary `uix.turn-state` node to the current leaf. This is the same durable state representation normally written beside a user/agent boundary, but here it is committed without an adjacent user message.

The commit belongs to the source branch. Its snapshots are never held across the transition, copied into the target branch, or committed after moving the leaf. If committing fails, the transition does not proceed.

### 2. Change the selected graph or leaf

Open another session, reload the current session's runtime/contributions, or—later—move the current session leaf to an earlier/alternate node.

### 3. Derive the selected-branch projection

Pi's `getBranch()` follows parent links from the selected leaf to the root and returns the resulting linear branch in root-to-leaf order. Walk that branch forward once to produce two distinct projections: persisted message entries for the substrate-owned transcript, and the latest value for every currently registered turn-state cell. Feature restoration does not replay user/assistant/tool messages or rerun live message handlers.

### 4. Apply feature state, then publish completion

Validate each active cell's latest raw value against its registered schema, then invoke `restore(latest | undefined)`. Canvas's `documents` cell resolves its current document refs and recreates working documents plus anchor metadata; other cells restore their own complete values. Stateless features have no cells.

A schema or restore failure fails that owning feature, not the session transition. UIX does not roll the workspace back: the target session remains active, healthy features continue, and the failed feature is unavailable under the ordinary feature-failure presentation/lifetime. There is no separate `loading | ready | failed` feature-status model: active contributions/surfaces already represent successful activation, while failure creates a structured diagnostic owned by that feature.

A diagnostic exposes a stable searchable error `code`, unique per-occurrence `diagnosticId`, and human-safe summary, not a raw stack. The id is minted at the first capture boundary and preserved through propagation; layers may append bounded, timestamped context frames without replacing the original cause or dumping arbitrary state. The substrate retains the sanitized technical diagnostic—owning feature and phase, cause chain, stack, relevant safe state refs, and runtime/log context—under that id so the future [agent-assisted runtime recovery](./backlog.md) surface can offer **Ask agent to fix** without requiring DevTools or losing the evidence. Workspace failure presentation is driven from that diagnostic rather than a duplicate feature-status registry. The host replaces/overlays the failed feature's owned surface area with a minimal failure presentation containing the safe summary, diagnostic id, and fix-source/reload guidance; a whole-feature failure covers all of that feature's known surfaces. This error presentation counts as settled under the existing first-render gate. Transient notifications may announce a failure later but are not the source of truth.

One restore scheduler applies on initial startup, reload, new/switch, and future rewind. All values in the selected-branch projection are validated before restore callbacks begin. Features have no cross-feature initialization dependency, so different features restore concurrently and settle independently. Within one feature, its named cells restore sequentially in contribution declaration order so feature-local state such as documents then selection can establish its own dependencies. A transition becomes observable as complete after every feature restore has either succeeded or failed; its result still identifies the active target so renderer state cannot remain pointed at the source. Startup has the same feature-isolated failure behavior but no source commit or transition response. This work builds the minimal substrate diagnostic registry needed to retain/query `code`, `diagnosticId`, safe summary, and sanitized technical details. The minimal host-owned surface-area failure presentation lands here; expandable diagnostic rendering and the full **Ask agent to fix** recovery interaction remain later work. The exact main-to-renderer diagnostic transport remains unsettled.

### Future branch behavior

No branch-switch UI or rewind implementation belongs in this workstream. The required future behavior is nevertheless fixed:

```text
commit source leaf
→ move leaf to target node
→ replay target root→leaf
→ restore target feature state
→ next turn appends from target and naturally creates the branch
```

Replay never appends state to the target merely by viewing/restoring it. The next real append creates the branch through Pi's existing parent-link mechanics. Switching back to the source later replays its standalone turn-state commit for free because that node is already on the source branch.

Initial application load has no source commit; it opens the selected session and derives its projection, then uses the same concurrent-across-features/sequential-within-feature restore scheduler. Reload does have a source commit: old contributions create snapshots first, bags/runtime reload, then new contributions replay the same branch including that commit.

## Settled empty-history behavior

A newly created session starts every stateful feature from its fresh/default state. UIX commits the source session's current turn state before leaving but never copies that commit or its snapshot refs into the new graph. The target's missing cell values are meaningful input: each active cell receives `restore(undefined)` and must reset/initialize its value rather than leaving previous working state mounted.

The same rule applies when opening an older session with no state for a feature, or when a feature is added to a session that predates its turn-state contribution. A new conversation over cloned state is a **fork**, not `new_session` or `Mod+N`: the forked graph carries the selected source path, including its turn-state nodes, and restores from that copied history without inventing a synthetic initial state.

## Relationship to durable transcript identity, live taps, and persistence

[D0 and D1 of durable transcript identity](./durable-transcript-identity.md) have landed. Live append observation and canonical transcript item derivation remain valid, and their observer/forwarder lifetime follows the active generation owned through Pi's `AgentSessionRuntime`. The runtime migration has landed before session mutations.

D3 is the shared branch-projection work. Transcript items and latest values for currently registered turn-state cells come from one selected branch rather than unrelated startup, reload, session-switch, and branch-switch walkers. Transcript consumes persisted messages for display; feature restoration consumes only its named state-cell values.

Live message taps are a separate, unbuilt contribution path. They react only while messages/turns occur and may update feature working state. Anything from a tap that must survive reload, switch, restart, or rewind must reach durable turn state—inline or through stable referenced ids—by an appropriate lifecycle boundary. Uncommitted buffer state is intentionally ephemeral. Session restoration never reruns taps or regexes historical messages, avoiding duplicate side effects and remaining valid after compaction. The aligned future tap is tracked in [the plans backlog](./backlog.md) and the [UIX-core composition design](../design/uix-core-composition.md).

The restore half intersects [persistence and session foundation](./persistence-and-session-foundation.md): each named state cell contributes schema, snapshot creation, and restore together under one lifetime and identity. This plan fixes projection/restoration, complete-value/schema semantics, and feature-isolated no-rollback failure behavior; diagnostic transport and recovery presentation are later hardening.

## Relationship to TypeScript feature admission

The schema-bound contribution shape gives ordinary TypeScript compile-time agreement between `createSnapshot()` and `restore()`, and runtime contribution validation requires a TypeBox schema plus both functions. The running app does **not** yet execute the planned TS7 source-admission check before loading arbitrary workspace features. Until [feature source admission](../design/feature-source-admission.md) lands, repository typecheck protects in-tree features and runtime validation protects actual snapshot/persisted values, but the loader cannot promise that every arbitrary feature candidate passed the compiler before execution.

The future TS7 admission gate should reject a candidate whose state-cell callbacks do not typecheck against their shared schema before replacing the live feature generation. It complements rather than replaces TypeBox: source typing proves the declared callback contract, while runtime checks prove the actual produced and persisted values. A restore-time schema failure makes that feature unavailable while siblings and the selected session remain active; richer diagnostics land in the later robustness unit.

## Deferred design checkpoints

These decisions remain valuable, but they do not block the early vertical slices. Resolve each only before its mapped later unit:

1. **Workspace/Chat polish** — rename presentation, focus/draft behavior, and the exact notice invocation/rendering path used by busy New Session and Reload guards. The controller and guards land earlier; polished notice placement does not.
2. **Diagnostic transport and pre-surface failure placement** — how feature-owned diagnostics reach host-owned surface-area failure presentation, and where an activation failure appears if surface metadata was never available. This belongs to robustness after switching.
3. **Incompatible same-cell schema evolution** — migration beyond optional fields and removed cells. V1 runtime validation/failure isolation is sufficient for the core path; migration tooling remains later.

## Ordered build sequence

S0–S3 are the shortest correct route to New Session and then visible session switching. S4 adds naming. S5 hardens failures and presentation under the already-settled contracts. Do not introduce temporary compatibility APIs merely to shorten a unit.

### S0 — Pi runtime replacement foundation · **landed 2026-07-17**

Migrate the driver to Pi's supported `AgentSessionRuntime` while preserving the cheap eager history-manager tier, lazy live agent creation, current prompt/event behavior, and first-render independence. Bind transcript observation and Pi-owned resources to the active runtime generation. This unit changes no visible session behavior; it removes custom replacement mechanics before New Session relies on them.

### S1 — Named state cells and transition restoration · **in progress**

**Progress.** The keyed schema/snapshot/restore contract, substrate-derived identities, plain-JSON validation, per-cell complete-value change suppression, cell-scoped history reads, and Canvas `documents` snapshot/restore implementation have landed. The shared selected-branch projection now derives transcript items plus turn state as of the leaf, retaining the latest raw value per active cell in one forward pass. The restore scheduler validates all projected values before callbacks, restores features concurrently and each feature's cells sequentially, passes `undefined` for missing cells, and isolates feature failures. Bootstrap activation now restores without opening Pi services, runtime creation waits for it, and replacement-session rebind completes only after target restoration. Reload restoration and source commits remain.

Migrate turn state from one singleton per feature to keyed schema/snapshot/restore cells with substrate-derived identities, TypeBox compile-time/runtime agreement, complete-value change suppression, and plain-JSON persistence. Derive one selected-branch projection containing transcript items plus the latest raw value per active cell, validate once at the leaf, and use the shared restore scheduler on startup/reload. Commit source state before reload/transition. Restore features concurrently and each feature's cells sequentially. Prove Canvas recreates its working documents from `documents` and resets every active cell on `undefined`.

This is the minimum correctness foundation for New Session. Use existing structured failure logging while building this happy path; the diagnostic registry and host failure overlays intentionally wait for S5. This unit fulfills the D3 overlap and does not build TS7 admission or live message taps.

### S2 — New Session vertical slice

Add payload-free `new_session`, persisted selected-session identity/cache, and the workspace session controller. A backend request aborts and settles an active run, commits the source state, asks `AgentSessionRuntime` for a fresh graph, restores every active cell from `undefined`, and returns the new `SessionSummary` only after restoration settles. The controller updates shared active-session state from that response; Chat clears/loads against the new id.

Register substrate-owned New Session with `mod+n` beside Reload so it exists without Chat. Keep the action invokable but guard on current workspace agent state; if busy it does not call the backend. Rich transient-notice presentation follows later rather than blocking this slice. Verify a new session never clones source turn-state refs.

### S3 — Session Switching vertical slice

Add `session_history`, the mtime-ordered `list_session_summaries`, and `switch_session({ sessionId })`. Implement the lightweight recent-file reader and its explicit-name → first-user-message → `New conversation` label projection, independent active-history/recent-list hydration, renderer-local latest-request guards, and a minimal recent-session selector. Every selector entry uses the same workspace session controller: abort/settle if a direct request reached main, commit source state, switch through `AgentSessionRuntime`, derive the target projection, restore it, then update shared renderer state from the response. No session-change broadcast is added.

This unit delivers visible switching before rename polish, diagnostic UI, search, pagination, or indexing.

### S4 — Naming and label polish

Add explicit rename/clear UI over `set_session_name` and finish cached active-label reconciliation around the label projection already required by S3. Apply the settled 100-character validation and update recent rows from mutation responses. Settle only the focus/draft details needed by the reviewed UI; richer Chat polish can remain in S5.

### S5 — Defensive hardening and failure presentation

Build the minimal structured diagnostic registry (`code`, `diagnosticId`, safe summary, sanitized queryable details), preserve/enrich one diagnostic through propagation, and apply the settled no-workspace-rollback/per-feature failure policy consistently across startup, reload, new, and switch. Add host-owned overlays for known failed feature surface areas, settle transport and the no-known-surface placement, and cover schema-validation/restore callback failures. Harden direct reload abort behavior, lifecycle races, failure reporting, and Chat draft/focus behavior. The full toast renderer and **Ask agent to fix** interaction remain separate backlog deliverables.

### S6 — Verification and documentation

Update shipped agent/state/settings docs, architecture-of-record, durable-transcript-identity D3 status, and persistence restore status as each implemented unit lands rather than waiting for one final documentation batch. At the end, verify representative large summaries without introducing an index absent measured need and run the complete repository checks.

## Boundary / later

- Full branch-tree listing, preview, rewind, navigation, fork/clone, labels, and rollback UI.
- Automatic model-generated session names.
- Persistent summary indexes, reverse-paged readers, file watching, streamed result batches, full-text search, deletion/trash, export, and import.
- Multiple simultaneously active agent/session slots in one workspace.
- Toast renderer ownership/placement and the complete **Ask agent to fix** recovery interaction.
- Migration tooling for genuinely incompatible schemas under one persisted cell identity.
- Compatibility aliases for the old ambiguous `history` request; migrate directly to `session_history`.
